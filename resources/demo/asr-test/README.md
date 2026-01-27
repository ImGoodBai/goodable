# Wanjie ASR Service Test

测试万节 ASR 语音识别服务的 Demo。

## 服务信息

- **提交 URL**: `http://122.191.109.151:1216/v1/audio/transcriptions`
- **查询 URL**: `http://122.191.109.151:1216/v1/audio/transcriptions/{task_id}`
- **文档**: `http://122.191.109.151:1216/docs`

## 快速测试

```bash
python3 test_asr.py
```

## API 使用方式

### 1. 提交音频任务

**请求格式**:
```python
POST http://122.191.109.151:1216/v1/audio/transcriptions

Body (JSON):
{
    "file_urls": ["<audio_url>"],  # 必须是数组！
    "format": "mp3",
    "sample_rate": 16000,
    "channels": 1,
    "enable_itn": true,
    "enable_punct": true,
    "show_utterances": true
}
```

**响应**:
```json
{
    "tasks": [
        {
            "task_id": "8dcfc482-f966-4aef-ab21-ca30dc932fba",
            "upstream_status_code": "20000000",
            "message": "OK",
            "url": "..."
        }
    ]
}
```

### 2. 轮询查询结果

**请求格式**:
```python
GET http://122.191.109.151:1216/v1/audio/transcriptions/{task_id}?include_raw=true
```

**响应**:
```json
{
    "status": "succeeded",
    "text": "完整转录文本",
    "sentences": [
        {
            "start_ms": 0,
            "end_ms": 12070,
            "text": "这是一句话",
            "words": [...]
        }
    ]
}
```

**状态值**:
- `running` - 处理中
- `succeeded` - 成功
- `failed` - 失败

## 与旧文档的差异

**旧文档（docs/ai-services/asr-wanjie.md）**说的是：
- 上传文件 (multipart/form-data)
- 使用 `file` 字段

**实际 API 要求**:
- JSON body
- 使用 `file_urls` 数组（支持批量）
- 不需要上传文件，直接传 URL

## 测试结果

✅ 测试音频: https://sf5-hl-ali-cdn-tos.douyinstatic.com/obj/ies-music/7595986548055984950.mp3
✅ 转录文本: "这个网站能爬所有爆款视频..."
✅ 时长: 12070ms (12秒)
✅ 处理时间: ~3秒
