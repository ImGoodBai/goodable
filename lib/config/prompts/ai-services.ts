/**
 * AI Services Prompt Template
 *
 * This file contains the simplified system prompt for platform-provided AI services.
 * Detailed usage docs are stored in resources/ai-services/ and AI can read them when needed.
 */

import { AI_SERVICES_DOCS_PATH } from '@/lib/config/paths';

/**
 * AI Services configuration type
 */
export interface AIServicesConfig {
  asr?: {
    enabled: boolean;
    provider: 'wanjie';
    description?: string;
    wanjie?: {
      base_url: string;
      submit_url: string;
      query_url_template: string;
    };
  };
}

/**
 * Build AI services prompt section
 *
 * Includes service overview with actual config values.
 * Detailed usage docs are in resources/ai-services/ for code examples.
 *
 * @param config - AI services configuration
 * @returns Prompt text or empty string if no services enabled
 */
export function buildAIServicesPrompt(config: AIServicesConfig | undefined): string {
  if (!config) return '';

  const sections: string[] = [];

  // ASR Service
  if (config.asr?.enabled && config.asr.wanjie) {
    const w = config.asr.wanjie;
    sections.push(`### ASR (Speech Recognition)
- **Provider:** Wanjie
- **Description:** ${config.asr.description || 'Async batch speech recognition, Chinese support, ~10min max'}
- **Submit URL:** \`${w.submit_url}\`
- **Query URL Template:** \`${w.query_url_template}\` (replace \`{task_id}\`)
- **Env Vars:** \`GOODABLE_ASR_SUBMIT_URL\`, \`GOODABLE_ASR_QUERY_URL_TEMPLATE\`

**Quick Example (Python):**
\`\`\`python
import os, requests, time

# Submit
resp = requests.post(os.environ['GOODABLE_ASR_SUBMIT_URL'], json={
    'file_urls': ['https://example.com/audio.mp3'],  # Must be array!
    'format': 'mp3', 'sample_rate': 16000, 'channels': 1,
    'enable_itn': True, 'enable_punct': True, 'show_utterances': True
})
task_id = resp.json()['tasks'][0]['task_id']

# Poll (backend: while loop with sleep)
query_url = os.environ['GOODABLE_ASR_QUERY_URL_TEMPLATE'].replace('{task_id}', task_id)
while True:
    data = requests.get(query_url, params={'include_raw': 'true'}).json()
    if data['status'] == 'succeeded':
        print(data['text'])
        for s in data['sentences']:
            print(f"[{s['start_ms']}ms-{s['end_ms']}ms] {s['text']}")
        break
    elif data['status'] == 'failed':
        raise Exception(data.get('message'))
    time.sleep(3)
\`\`\`

**Frontend Polling (JavaScript):** Use recursive \`setTimeout\`, NOT \`setInterval\`:
\`\`\`javascript
// ✅ Correct
async function poll(taskId, attempts = 200) {
    const data = await fetch(\`/api/status/\${taskId}\`).then(r => r.json());
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed') throw new Error(data.message);
    if (attempts > 0) {
        await new Promise(r => setTimeout(r, 3000));
        return poll(taskId, attempts - 1);
    }
    throw new Error('Timeout');
}
// ❌ Wrong: setInterval(async () => {await fetch(...)}, 3000)  // May cause concurrent requests!
\`\`\`

**Full Doc:** \`${AI_SERVICES_DOCS_PATH}/asr-wanjie.md\` (includes FastAPI backend example)`);
  }

  if (sections.length === 0) return '';

  return `
## Platform Built-in AI Services

${sections.join('\n\n')}
`;
}

/**
 * Build environment variables for AI services
 *
 * @param config - AI services configuration
 * @returns Record of environment variables to inject
 */
export function buildAIServicesEnv(config: AIServicesConfig | undefined): Record<string, string> {
  const env: Record<string, string> = {};

  if (!config) return env;

  // ASR environment variables
  if (config.asr?.enabled && config.asr.wanjie) {
    const wanjie = config.asr.wanjie;
    if (wanjie.base_url) {
      env.GOODABLE_ASR_BASE_URL = wanjie.base_url;
    }
    if (wanjie.submit_url) {
      env.GOODABLE_ASR_SUBMIT_URL = wanjie.submit_url;
    }
    if (wanjie.query_url_template) {
      env.GOODABLE_ASR_QUERY_URL_TEMPLATE = wanjie.query_url_template;
    }
  }

  // Also inject docs path so subprocess can access it
  env.GOODABLE_AI_SERVICES_DOCS_PATH = AI_SERVICES_DOCS_PATH;

  return env;
}
