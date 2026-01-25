# Good-MP-Post Skill Test

Automated test for WeChat Official Account article publishing skill.

## Prerequisites

1. Configure WeChat credentials in `skills/good-mp-post/.env`:
   ```bash
   cp skills/good-mp-post/.env.example skills/good-mp-post/.env
   # Edit .env and fill WECHAT_APP_ID and WECHAT_APP_SECRET
   ```

2. Ensure test image exists at `public/screenshot/01.png`

3. Install dependencies in project root:
   ```bash
   npm install
   ```

## Run Test

```bash
# From project root
npx tsx skills/good-mp-post/test/test_skill.ts
```

## Test Flow

1. Load WeChat credentials from `.env`
2. Prepare test image (`01.png`)
3. Send natural language prompt to AI via Claude SDK
4. AI executes skill: upload image → create draft → publish article
5. Validate success by checking response keywords

## Success Criteria

Test passes if AI response contains any of:
- `media_id`
- `发布成功`
- `草稿创建成功`
- `successfully`

## Notes

- Test uses real WeChat API (consumes daily quota)
- Article will be published to configured Official Account
- WeChat limits: 10 publishes/day, 100 drafts/day, 1000 uploads/day
