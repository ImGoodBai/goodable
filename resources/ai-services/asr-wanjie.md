# Wanjie ASR Service

Async batch speech recognition service for audio transcription.

## Features

- **Async processing**: Submit audio URL, poll for result
- **Batch mode**: Supports multiple URLs in one request
- **Chinese support**: Optimized for Mandarin
- **Max duration**: ~10 minutes per file
- **Formats**: mp3, wav, m4a, flac

## Environment Variables

These are auto-injected by the platform:

| Variable | Description |
|----------|-------------|
| `GOODABLE_ASR_BASE_URL` | Service base URL |
| `GOODABLE_ASR_SUBMIT_URL` | Submit audio task endpoint |
| `GOODABLE_ASR_QUERY_URL_TEMPLATE` | Query result endpoint, use `{task_id}` as placeholder |

## API Flow

1. **Submit**: POST audio URL(s) to `GOODABLE_ASR_SUBMIT_URL`
2. **Poll**: GET `GOODABLE_ASR_QUERY_URL_TEMPLATE` (replace `{task_id}`) until status is `succeeded`
3. **Result**: Parse transcription from response

## Python Example (Backend/CLI)

```python
import os
import requests
import time

def transcribe_audio(audio_url: str, timeout: int = 600) -> dict:
    """
    Transcribe audio file using Wanjie ASR service.

    Args:
        audio_url: HTTP URL to audio file (mp3, wav, etc.)
        timeout: Max wait time in seconds (default 600)

    Returns:
        dict with transcription result including sentences with timestamps
    """
    # Step 1: Submit audio URL
    submit_url = os.environ.get('GOODABLE_ASR_SUBMIT_URL')
    if not submit_url:
        raise ValueError('GOODABLE_ASR_SUBMIT_URL not set')

    resp = requests.post(
        submit_url,
        json={
            'file_urls': [audio_url],  # Must be array!
            'format': 'mp3',
            'sample_rate': 16000,
            'channels': 1,
            'enable_itn': True,
            'enable_punct': True,
            'show_utterances': True
        },
        timeout=30
    )
    resp.raise_for_status()

    tasks = resp.json()['tasks']
    task_id = tasks[0]['task_id']

    # Step 2: Poll for result
    query_template = os.environ.get('GOODABLE_ASR_QUERY_URL_TEMPLATE')
    if not query_template:
        raise ValueError('GOODABLE_ASR_QUERY_URL_TEMPLATE not set')

    query_url = query_template.replace('{task_id}', task_id)

    for _ in range(timeout // 3):
        result = requests.get(query_url, params={'include_raw': 'true'})
        data = result.json()

        if data.get('status') == 'succeeded':
            return data
        if data.get('status') == 'failed':
            raise Exception(f"ASR failed: {data.get('message')}")

        time.sleep(3)

    raise TimeoutError(f'ASR task {task_id} timeout after {timeout}s')


# Usage
result = transcribe_audio('https://example.com/audio.mp3')
print(result['text'])  # Full transcription

# With timestamps
for sent in result.get('sentences', []):
    print(f"[{sent['start_ms']}ms-{sent['end_ms']}ms] {sent['text']}")
```

## JavaScript Example (Frontend)

```javascript
// Submit audio and start polling
async function transcribeAudio(audioUrl) {
    // Step 1: Submit audio URL
    const submitResp = await fetch('/api/asr/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl })
    });
    const { task_id } = await submitResp.json();

    // Step 2: Poll for result (use recursive setTimeout)
    return await pollResult(task_id);
}

// ✅ Correct: Recursive setTimeout (waits for request to complete)
async function pollResult(taskId, maxAttempts = 200) {
    if (maxAttempts <= 0) {
        throw new Error('Transcription timeout');
    }

    const resp = await fetch(`/api/asr/status/${taskId}`);
    const data = await resp.json();

    if (data.status === 'succeeded') {
        return data;  // { text: "...", sentences: [...] }
    } else if (data.status === 'failed') {
        throw new Error(data.message || 'Transcription failed');
    } else {
        // Still running, wait 3 seconds then retry
        await new Promise(resolve => setTimeout(resolve, 3000));
        return pollResult(taskId, maxAttempts - 1);
    }
}

// ❌ Wrong: setInterval + async (may cause concurrent requests)
// DON'T DO THIS:
// setInterval(async () => {
//     const data = await fetch(...);  // Next interval may start before this finishes!
//     if (data.status === 'succeeded') clearInterval(...);  // clearInterval timing issue
// }, 3000);

// Usage
transcribeAudio('https://example.com/audio.mp3')
    .then(result => {
        console.log(result.text);
        result.sentences.forEach(s => {
            console.log(`[${s.start_ms}ms-${s.end_ms}ms] ${s.text}`);
        });
    })
    .catch(err => console.error(err));
```

**Frontend Backend Example (FastAPI):**

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import os

app = FastAPI()

class AudioSubmitRequest(BaseModel):
    audio_url: str

@app.post("/api/asr/submit")
async def submit_audio(req: AudioSubmitRequest):
    submit_url = os.getenv("GOODABLE_ASR_SUBMIT_URL")
    async with httpx.AsyncClient() as client:
        resp = await client.post(submit_url, json={
            "file_urls": [req.audio_url],
            "format": "mp3", "sample_rate": 16000, "channels": 1,
            "enable_itn": True, "enable_punct": True, "show_utterances": True
        })
        resp.raise_for_status()
        data = resp.json()
        return {"task_id": data["tasks"][0]["task_id"]}

@app.get("/api/asr/status/{task_id}")
async def get_status(task_id: str):
    query_url = os.getenv("GOODABLE_ASR_QUERY_URL_TEMPLATE").replace("{task_id}", task_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(query_url, params={"include_raw": "true"})
        resp.raise_for_status()
        return resp.json()  # Forward ASR response to frontend
```

## Submit Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_urls` | array | Yes | Array of audio URLs (batch support) |
| `format` | string | No | Audio format (mp3, wav, etc.) |
| `sample_rate` | int | No | Sample rate in Hz (default 16000) |
| `channels` | int | No | Number of channels (default 1) |
| `enable_itn` | bool | No | Enable inverse text normalization |
| `enable_punct` | bool | No | Enable punctuation |
| `show_utterances` | bool | No | Include sentences with timestamps |

## Response Format

### Submit Response

```json
{
  "tasks": [
    {
      "task_id": "8dcfc482-f966-4aef-ab21-ca30dc932fba",
      "upstream_status_code": "20000000",
      "message": "OK",
      "url": "https://example.com/audio.mp3"
    }
  ]
}
```

### Query Response

```json
{
  "status": "succeeded",
  "text": "Full transcription text here",
  "sentences": [
    {
      "start_ms": 0,
      "end_ms": 2500,
      "text": "First sentence",
      "words": [
        {
          "start_ms": 0,
          "end_ms": 500,
          "text": "First"
        }
      ]
    }
  ]
}
```

## Status Values

| Status | Description |
|--------|-------------|
| `running` | Task processing |
| `succeeded` | Done, result available |
| `failed` | Error occurred |

## Error Handling

- Check env vars exist before using
- Handle HTTP errors from submit/query
- Implement timeout for polling (recommend 3s interval)
- Check for `failed` status in response

## Notes

- This service accepts **audio URLs**, not file uploads
- Supports batch processing (multiple URLs in `file_urls` array)
- Timestamps are in milliseconds (not seconds)
- Field names: `start_ms`, `end_ms`, `sentences` (not `utterances`)
