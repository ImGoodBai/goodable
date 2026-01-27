#!/usr/bin/env python3
"""
ASR Service Test Demo

Tests the Wanjie ASR service with a remote MP3 URL.
Based on goodvideobox implementation.
"""

import requests
import time

# ASR Service Config
SUBMIT_URL = "http://122.191.109.151:1216/v1/audio/transcriptions"
QUERY_URL_TEMPLATE = "http://122.191.109.151:1216/v1/audio/transcriptions/{task_id}"

# Test audio URL
AUDIO_URL = "https://sf5-hl-ali-cdn-tos.douyinstatic.com/obj/ies-music/7595986548055984950.mp3"


def submit_audio_url(audio_url: str) -> str:
    """Submit audio URL for transcription."""
    print(f"[1/2] Submitting audio URL to ASR service...")
    print(f"      URL: {audio_url}")
    print(f"      Endpoint: {SUBMIT_URL}")

    # Request body format from goodvideobox
    payload = {
        "file_urls": [audio_url],  # Must be array!
        "format": "mp3",
        "sample_rate": 16000,
        "channels": 1,
        "enable_itn": True,
        "enable_punct": True,
        "show_utterances": True
    }

    resp = requests.post(
        SUBMIT_URL,
        json=payload,
        timeout=60
    )

    print(f"      Response status: {resp.status_code}")
    print(f"      Response body: {resp.text}")

    resp.raise_for_status()
    data = resp.json()

    # Get task_id from tasks array
    tasks = data.get('tasks', [])
    if not tasks:
        raise ValueError(f"No tasks in response: {data}")

    task_id = tasks[0].get('task_id')
    if not task_id:
        raise ValueError(f"No task_id in first task: {tasks[0]}")

    print(f"      Task ID: {task_id}")
    return task_id


def poll_result(task_id: str, timeout: int = 300) -> dict:
    """Poll for transcription result."""
    query_url = QUERY_URL_TEMPLATE.format(task_id=task_id)
    print(f"[2/2] Polling result...")
    print(f"      URL: {query_url}")

    start_time = time.time()
    attempt = 0

    while time.time() - start_time < timeout:
        attempt += 1
        resp = requests.get(
            query_url,
            params={"include_raw": "true"},
            timeout=10
        )

        print(f"      Attempt {attempt}: status_code={resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            status = data.get('status', 'unknown')
            print(f"                     status={status}")

            if status == 'succeeded':
                return data
            elif status == 'failed':
                raise Exception(f"ASR failed: {data.get('message')}")

        time.sleep(3)

    raise TimeoutError(f"ASR task {task_id} timeout after {timeout}s")


def main():
    print("=" * 70)
    print("Wanjie ASR Service Test")
    print("=" * 70)

    try:
        # Step 1: Submit URL
        task_id = submit_audio_url(AUDIO_URL)

        # Step 2: Poll result
        result = poll_result(task_id)

        # Print result
        print("\n" + "=" * 70)
        print("TRANSCRIPTION RESULT")
        print("=" * 70)

        text = result.get('text', '')
        print(f"\n✅ Full transcription:\n{text}\n")

        sentences = result.get('sentences', [])
        if sentences:
            print("Sentences with timestamps:")
            for sent in sentences[:5]:  # Show first 5
                start_ms = sent.get('start_ms', 0)
                end_ms = sent.get('end_ms', 0)
                txt = sent.get('text', '')
                print(f"  [{start_ms}ms - {end_ms}ms] {txt}")

            if len(sentences) > 5:
                print(f"  ... and {len(sentences) - 5} more sentences")

        print("\n✅ ASR Test PASSED!")

    except Exception as e:
        print(f"\n❌ ASR Test FAILED: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
