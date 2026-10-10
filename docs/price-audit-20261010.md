# easytoken 价格核对（38 个模型）— 2026-10-10

- 基准：`main`（260d409）的 `assets/data.js`、`worker/catalog.js`，以及线上 `GET https://easytoken.si/v1/models`（2026-10-10 拉取，38 个模型，与 data.js 的 `ours` 全部一致）。
- 官方价、fal 价均为 2026-10-10 在页面上查看所得；未调用任何付费 API。查不到的写“无官方价/未上架/未核到”，没有估算冒充官方价。
- 差价% = easytoken 价 ÷ 对方价 − 1；正数 = 我们更贵，负数 = 我们更便宜。

## 换算假设

- 视频：16:9；720p = 1280×720、1080p = 1920×1080、24fps。Seedance 按 ModelArk 公式 tokens = 宽×高×fps×秒 ÷ 1024（720p = 21,600 tok/s）。像素尺寸是根据官方示例反推的，官方没有单独列表。
- 音频：Veo 按含音频价；Kling 3.0 按无音频 pro（1080p）；Kling 3.0 Turbo 官方只有含音频档；Seedance、Wan、HappyHorse、Grok、MiniMax H3 官方不单独收音频费。
- Kling 官方以 Unit 计价，1 Unit = $0.14（官方页面同时给出美元价）；std 按 720P，pro 按 1080P。
- PixVerse 官方以 credits 计价，按官方文档“$1 = 5 条 v6 720p 5s 无音频”（225 credits/$）换算。
- Hailuo 2.3：easytoken 的 standard/pro 跟 MiniMax 的 2.3-Fast/2.3 价格完全同比（都约是官方的 0.92 倍），所以判断 standard = 2.3-Fast，pro = 2.3。
- 图片：1K = 1024²；GPT Image 的 2K = 2560×1440；FLUX 的 2K = 2048² = 4MP。GPT Image 2 只有 high 质量的官方价能和 fal 默认档对上，kie 实际用哪个 quality 还没确认。
- Chat：表里比的是输出价，输入价写在备注里。官方价取标准档（Gemini ≤200K、GPT ≤272K 上下文）。
- 官方页：Google [Gemini API](https://ai.google.dev/gemini-api/docs/pricing) / [Vertex](https://cloud.google.com/vertex-ai/generative-ai/pricing)；[BytePlus ModelArk](https://docs.byteplus.com/en/docs/modelark/model-pricing)；[Kling](https://kling.ai/document-api/pricing/base/video)；[MiniMax](https://platform.minimax.io/docs/guides/pricing-paygo)；[PixVerse](https://docs.platform.pixverse.ai/pricing-796039m0)；[阿里云百炼国际站](https://www.alibabacloud.com/help/en/model-studio/model-pricing)；[OpenAI](https://developers.openai.com/api/docs/pricing)；[xAI](https://docs.x.ai/developers/pricing)；[BFL](https://bfl.ai/pricing?category=flux.2)；[Ideogram](https://ideogram.ai/pricing/?pricing_tab=api)；[ElevenLabs](https://elevenlabs.io/pricing/api)；[Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)。

## 主表（按首页计价单位）

| 模型 | 单位 | 官方价 | fal 价 | easytoken 价 | 对官方 | 对 fal | data.js official 现值 | 建议 |
|---|---|---|---|---|---|---|---|---|
| veo-3.1 | 8s 1080p quality 含音频 | $3.2 [官方](https://ai.google.dev/gemini-api/docs/pricing)<br>$0.40/s（GAPI 与 Vertex 一致） | $3.2 [fal](https://fal.ai/models/fal-ai/veo3.1)<br>$0.40/s | $1.466（$0.1833/s） | -54% | -54% | 6.0 | 错。改为 3.20 |
| seedance-2.5 | 5s 720p | $1.156 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$10.70/1M tok；1280×720×24fps=21,600 tok/s → $0.2311/s | $2.31 [fal](https://fal.ai/models/bytedance/seedance-2.5/text-to-video)<br>页面 5s 示例约 $2.31（≈$0.462/s） | $1.811（$0.3623/s） | +57% | -22% | 2.37 | 错。改为 1.16 |
| seedance-2 | 5s 720p | $0.756 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$7.0/1M tok → $0.1512/s | $1.517 [fal](https://fal.ai/models/bytedance/seedance-2.0/text-to-video)<br>$0.3034/s | $1.179（$0.2357/s） | +56% | -22% | null | 补 0.76 |
| seedance-2-fast | 5s 720p | $0.605 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$5.6/1M tok → $0.121/s（官方示例 $0.60） | $1.21 [fal](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video)<br>$0.2419/s | $0.713（$0.1426/s） | +18% | -41% | null | 补 0.60 |
| kling-3.0 | 5s 1080p pro 无音频 | $0.56 [官方](https://kling.ai/document-api/pricing/base/video)<br>0.8 Unit/s × $0.14 = $0.112/s | $0.56 [fal](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video)<br>$0.112/s | $0.5175（$0.1035/s） | -8% | -8% | 0.98 | 错。改为 0.56 |
| kling-3.0-turbo | 5s 1080p（官方仅有含音频档） | $0.7 [官方](https://kling.ai/document-api/pricing/base/video)<br>1.0 Unit/s = $0.14/s | $0.7 [fal](https://fal.ai/models/fal-ai/kling-video/v3/turbo/pro/image-to-video)<br>$0.14/s | $0.6469（$0.1294/s） | -8% | -8% | null | 补 0.70 |
| kling-2.6 | 5s 无音频（按 pro 1080p） | $0.35 [官方](https://kling.ai/document-api/pricing/base/video)<br>0.5 Unit/s = $0.07/s | $0.35 [fal](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video)<br>$0.07/s | $0.3162 | -10% | -10% | null | 补 0.35 |
| wan-3.0 | 5s 1080p | $1 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.20/s 列表价（页面挂“限时 7 折”标签但无折后价） | $1 [fal](https://fal.ai/models/alibaba/wan-3.0/text-to-video)<br>$0.20/s | $0.92（$0.184/s） | -8% | -8% | null | 补 1.00 |
| wan-3.0-prime | 5s 1080p | $1.4 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.28/s | $1.4 [fal](https://fal.ai/models/alibaba/wan-3.0-prime/text-to-video)<br>$0.28/s | $1.449（$0.2898/s） | +4% | +4% | null | 补 1.40 |
| wan-2.7 | 5s 1080p | $0.75 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.15/s | $0.75 [fal](https://fal.ai/models/fal-ai/wan/v2.7/text-to-video)<br>$0.15/s | $0.69（$0.138/s） | -8% | -8% | null | 补 0.75 |
| wan-2.6 | 5s 1080p | $0.75 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.15/s | $0.75 [fal](https://fal.ai/models/wan/v2.6/image-to-video)<br>$0.15/s（i2v 页） | $0.6009 | -20% | -20% | null | 补 0.75 |
| hailuo-2.3 | 6s 768p standard（=Hailuo 2.3 Fast） | $0.19 [官方](https://platform.minimax.io/docs/guides/pricing-paygo)<br>2.3-Fast 768P 6s $0.19/条；非 Fast 版 $0.28 | [fal standard 是非 Fast 版 $0.28；Fast 版未核到](https://fal.ai/models/fal-ai/minimax/hailuo-2.3/standard/image-to-video) | $0.1725 | -9% | — | null | 补 0.19（并在 unit 注明 Fast） |
| minimax-h3 | 6s 768p | $0.48 [官方](https://platform.minimax.io/docs/guides/pricing-paygo)<br>$0.08/s | $0.36 [fal](https://fal.ai/models/minimax/h3/image-to-video)<br>$0.06/s | $0.276（$0.046/s） | -42% | -23% | null | 补 0.48 |
| grok-imagine-video | 6s 720p | $0.3 [官方](https://docs.x.ai/developers/pricing)<br>$0.05/s 一口价（官方不分分辨率） | $0.42 [fal](https://fal.ai/models/xai/grok-imagine-video/text-to-video)<br>720p $0.07/s | $0.1552（$0.0259/s） | -48% | -63% | null | 补 0.30 |
| pixverse-v6 | 5s 720p 无音频 | $0.2 [官方](https://docs.platform.pixverse.ai/pricing-796039m0)<br>45 credits；官方文档“$1 = 5 条 v6 720p 5s 无音频” | $0.225 [fal](https://fal.ai/models/fal-ai/pixverse/v6/text-to-video)<br>$0.045/s | $0.207（$0.0414/s） | +3% | -8% | null | 补 0.20 |
| happyhorse-1.1 | 5s 1080p | $0.9 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.18/s | $0.9 [fal](https://fal.ai/models/alibaba/happy-horse/v1.1/text-to-video)<br>$0.18/s | $0.8337（$0.1668/s） | -7% | -7% | null | 补 0.90 |
| gpt-image-2.5 | 每张 2K | [无官方价](https://developers.openai.com/api/docs/pricing)<br>无官方按张价（仅 token 价：图像输出 $30/1M） | $0.0554 [fal](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image)<br>high 质量 2560×1440 $0.0554（fal 实测） | $0.0575 | — | +4% | 0.25 | 错。删掉（官方无按张价） |
| gpt-image-2 | 每张 1K（1024²） | $0.211 [官方](https://developers.openai.com/api/docs/guides/image-generation)<br>high $0.211 / medium $0.053 / low $0.006 | $0.211 [fal](https://fal.ai/models/openai/gpt-image-2)<br>high $0.211（fal 默认 high） | $0.0345 | -84% | -84% | null | 需先确认 kie 用哪个 quality；若 high 补 0.211 |
| nano-banana-pro | 每张 2K | $0.134 [官方](https://ai.google.dev/gemini-api/docs/pricing)<br>$120/1M 图像 tok × 1120 = $0.134 | $0.15 [fal](https://fal.ai/models/fal-ai/nano-banana-pro)<br>$0.15 | $0.1035 | -23% | -31% | 0.15 | 错（写成了 fal 价）。改为 0.134 |
| nano-banana-2 | 每张 1K | $0.067 [官方](https://ai.google.dev/gemini-api/docs/pricing)<br>Gemini 3.1 Flash Image，$0.067 | $0.08 [fal](https://fal.ai/models/fal-ai/nano-banana-2)<br>$0.08 | $0.046 | -31% | -43% | null | 补 0.067 |
| nano-banana-2.1 | 每张 1K | $0.0336 [官方](https://ai.google.dev/gemini-api/docs/pricing)<br>$30/1M 图像 tok × 1120 = $0.0336 | $0.04 [fal](https://fal.ai/models/google/nano-banana-2.1)<br>≈$0.040（fal 按 token 计，示例价） | $0.023 | -32% | -43% | null | 补 0.034 |
| seedream-5-pro | 每张 2K | $0.09 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$0.09（>2.61MP） | $0.135 [fal](https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image)<br>$0.135（标注 tentative） | $0.0805 | -11% | -40% | null | 补 0.09 |
| seedream-5-flash | 每张 2K | $0.018 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$0.018 一口价 | $0.027 [fal](https://fal.ai/models/bytedance/seedream/v5/flash/text-to-image)<br>$0.027 | $0.0186 | +4% | -31% | null | 补 0.018 |
| seedream-5-lite | 每张 2K–4K | $0.035 [官方](https://docs.byteplus.com/en/docs/modelark/model-pricing)<br>$0.035 一口价 | $0.035 [fal](https://fal.ai/models/bytedance/seedream/v5/lite/text-to-image)<br>$0.035 | $0.0316 | -10% | -10% | null | 补 0.035 |
| flux-2-pro | 每张 1MP | $0.03 [官方](https://bfl.ai/pricing?category=flux.2)<br>首 MP $0.03，之后 $0.015/MP | $0.03 [fal](https://fal.ai/models/fal-ai/flux-2-pro)<br>$0.03 首 MP | $0.0288 | -4% | -4% | 0.05 | 错。改为 0.03 |
| flux-2-flex | 每张 1K | $0.05 [官方](https://bfl.ai/pricing?category=flux.2)<br>$0.05/MP | $0.05 [fal](https://fal.ai/models/fal-ai/flux-2-flex)<br>$0.05/MP | $0.0805 | +61% | +61% | null | 补 0.05（注意我们更贵） |
| imagen-4 | 每张 standard | $0.04 [官方](https://cloud.google.com/vertex-ai/generative-ai/pricing)<br>Vertex $0.04（Gemini API 已不列） | fal 未上架（imagen4 页面 404） | $0.046 | +15% | — | null | 补 0.04 |
| ideogram-v3 | 每张 balanced | $0.06 [官方](https://ideogram.ai/pricing/?pricing_tab=api)<br>Default/Balanced $0.06 | $0.06 [fal](https://fal.ai/models/fal-ai/ideogram/v3)<br>$0.06 | $0.0403 | -33% | -33% | null | 补 0.06 |
| qwen-image-3 | 每张 1K | $0.03 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.03 | fal 未上架（fal 只有 Pro 档 $0.075） | $0.0276 | -8% | — | null | 补 0.03 |
| qwen-image-3-pro | 每张 1K | $0.04 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>1K $0.04 / 2K $0.075 | $0.075 [fal](https://fal.ai/qwen-image-3)<br>$0.075 一口价 | $0.0368 | -8% | -51% | null | 补 0.04 |
| grok-imagine-image | 每张（kie 走 grok-imagine-image-2.0） | $0.04 [官方](https://docs.x.ai/docs/models/grok-imagine-image-2.0)<br>grok-imagine-image-2.0 $0.04（旧版 grok-imagine-image $0.02） | $0.04 [fal](https://fal.ai/models/xai/grok-imagine-image/v2.0/text-to-image)<br>1K low $0.04 | $0.023 | -43% | -43% | null | 补 0.04 |
| wan-2.7-image | 每张 | $0.03 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.03 | $0.03 [fal](https://fal.ai/models/fal-ai/wan/v2.7/text-to-image)<br>$0.03 | $0.0276 | -8% | -8% | null | 补 0.03 |
| wan-2.7-image-pro | 每张 | $0.075 [官方](https://www.alibabacloud.com/help/en/model-studio/model-pricing)<br>$0.075 | $0.075 [fal](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit)<br>$0.075（edit 端点） | $0.069 | -8% | -8% | null | 补 0.075 |
| suno-v6 | 每首（≤4 分钟） | [无官方价](https://suno.com)<br>无官方 API 价（platform.suno.com 需登录，无公开价） | fal 未上架 | $0.08 | — | — | 0.1 | 错。删掉 |
| elevenlabs-v3 | 每 1k 字符 | $0.08 [官方](https://elevenlabs.io/pricing/api)<br>Eleven v3 $0.08/1k 字符（所有档位同价） | $0.1 [fal](https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3)<br>$0.10/1k 字符 | $0.18 | +125% | +80% | 0.3 | 错。改为 0.08 |
| claude-opus-5-5 | 每 1M 输出 tok | $20 [官方](https://platform.claude.com/docs/en/about-claude/pricing)<br>输入 $4 / 输出 $20 | fal 未单独标价（仅 OpenRouter 透传） | $20 | +0% | — | 25.0 | 错。改为 20.00 |
| gpt-5.5 | 每 1M 输出 tok | $30 [官方](https://developers.openai.com/api/docs/pricing)<br>输入 $5 / 输出 $30（≤272K） | fal 未单独标价 | $8 | -73% | — | 10.0 | 错。改为 30.00 |
| gemini-3-pro | 每 1M 输出 tok | $12 [官方](https://ai.google.dev/gemini-api/docs/pricing)<br>Gemini 3 Pro 已于 2026-03-09 下线；后继 3.1 Pro 输入 $2 / 输出 $12（≤200K） | fal 未上架 | $9.6 | -20% | — | 12.0 | 数值同 3.1 Pro，但模型已下线，应改名/改 upstream |

## 需要特别注意的问题

1. **首页 official 值，8 个写错，2 个该删，gemini-3-pro 数值对但模型已下线，其余 27 个是 null。** 写错的 8 个：veo-3.1 写 6.00，应为 3.20；seedance-2.5 写 2.37，应为 1.16；kling-3.0 写 0.98，应为 0.56；nano-banana-pro 写 0.15，那是 fal 价，官方是 0.134；flux-2-pro 写 0.05，应为 0.03；elevenlabs-v3 写 0.30，应为 0.08；claude-opus-5-5 写 25，应为 20；gpt-5.5 写 10，应为 30。该删的 2 个：gpt-image-2.5 写 0.25，官方没有按张价；suno-v6 写 0.10，Suno 没有公开 API 价。首页“−X%”标签是按这些值算的，所以 veo、seedance-2.5、kling-3.0、elevenlabs、claude 的省钱幅度都被夸大了，seedance-2.5 和 elevenlabs 实际上比官方贵。
2. **比官方贵的模型：** elevenlabs-v3（+125%）、flux-2-flex 1K（+61%）、seedance-2.5（+57%）、seedance-2（+56%）、seedance-2-fast（+18%）、imagen-4（+15%）、wan-3.0-prime（+4%）、seedream-5-flash（+4%）、pixverse-v6（+3%）。其中 Seedance 全系列、elevenlabs 和 flux-2-flex 1K 的 kie 进价本身就高于官方价（例如 Seedance 2.5 720p kie $0.315/s，官方 $0.231/s），只降加价率压不到官方价以下，要压就得换上游，比如直连 BytePlus ModelArk。
3. **Chat 可能在亏钱：** gpt-5.5 卖输入 $1.6 / 输出 $8，官方是 $5 / $30；gemini-3-pro 卖 $1.92 / $9.6，官方 3.1 Pro 是 $2 / $12；claude-opus-5-5 和官方同价（$4 / $20）。这三个都通过 OpenRouter 调用，OpenRouter 按官方价收费，所以前两个每次调用都在倒贴，Claude 也没有毛利。
4. **gemini-3-pro 已下线：** Google 在 2026-03-09 停了 gemini-3-pro-preview，后继是 3.1 Pro。catalog.js 里的 upstream `google/gemini-3-pro` 需要确认现在还能不能调通。
5. **官方没有的选项：** veo-3.1 的 lite-4k，Google 官方和 fal 都不支持 Lite 4K；grok-imagine-video 的 1080p，xAI 基础版官方只有一口价，fal 上 1080p 只在 v1.5 才有。这两个要确认 kie 实际调的是哪个模型。
6. **其他：** wan-3.0 官方页面挂着“限时 7 折”标签，但没有给出折后价，表里用的是列表价。minimax-h3 768p 在 fal 上（$0.06/s）比官方（$0.08/s）还便宜。

## 分选项附表（按单位单价，官方 / fal / easytoken）

| 模型 | 选项 | 官方 | fal | easytoken |
|---|---|---|---|---|
| veo-3.1（/s，含音频） | quality 720p/1080p/4k | 0.40/0.40/0.60 | 0.40/0.40/0.60 | 0.180/0.183/0.266 |
| veo-3.1 | fast 720p/1080p/4k | 0.10/0.12/0.30 | 0.15/0.15/0.35 | 0.043/0.047/0.129 |
| veo-3.1 | lite 720p/1080p/4k | 0.05/0.08/不支持 | 0.05/0.08/不支持 | 0.022/0.025/0.108 |
| seedance-2.5（/s） | 480p/720p/1080p | 0.103/0.231/0.569 | ≈0.221/0.462/1.164 | 0.161/0.362/0.909 |
| seedance-2（/s） | 480p/720p/1080p/4k | 0.070/0.151/0.374/0.778 | 0.141/0.303/0.682/1.555 | 0.109/0.236/0.587/1.196 |
| seedance-2-fast（/s） | 480p/720p | 0.056/0.121 | 0.113/0.242 | 0.068/0.143 |
| kling-3.0（/s） | std/std+音频/pro/pro+音频/4K | 0.084/0.126/0.112/0.168/0.42 | 同官方 | 0.081/0.115/0.104/0.155/0.385 |
| kling-3.0-turbo（/s） | 720p/1080p | 0.112/0.14 | 同官方 | 0.104/0.129 |
| kling-2.6（/条） | 5s/5s+音频/10s/10s+音频 | 0.35/0.70/0.70/1.40 | 同官方 | 0.316/0.633/0.633/1.265 |
| wan-3.0（/s） | 480p/720p/1080p | 0.05/0.10/0.20 | 同官方 | 0.046/0.092/0.184 |
| wan-3.0-prime（/s） | 480p/720p/1080p | 0.068/0.14/0.28 | 同官方 | 0.070/0.145/0.290 |
| wan-2.7（/s） | 720p/1080p | 0.10/0.15 | 同官方 | 0.092/0.138 |
| wan-2.6（/5s 条） | 720p/1080p | 0.50/0.75 | 同官方 | 0.403/0.601 |
| hailuo-2.3（/条） | std 768p 6s/10s、1080p 6s | 0.19/0.32/0.33（2.3-Fast） | 未核到 | 0.173/0.288/0.288 |
| hailuo-2.3（/条） | pro 768p 6s/10s、1080p 6s | 0.28/0.56/0.49 | 0.28/0.56/0.49 | 0.259/0.518/0.46 |
| minimax-h3（/s） | 768p/2k | 0.08/0.13（前 5 张输入图免费，之后 $0.04/张） | 0.06/0.13 | 0.046/0.075（输入图 $0.023/张） |
| grok-imagine-video（/s） | 480p/720p/1080p | 0.05 一口价/同/无 | 0.05/0.07/基础版无 | 0.014/0.026/0.046 |
| pixverse-v6（/s） | 360/540/720/1080 无音频 | 0.022/0.031/0.040/0.080 | 0.025/0.035/0.045/0.090 | 0.023/0.032/0.041/0.083 |
| pixverse-v6（/s） | 360/540/720/1080 含音频 | 0.031/0.040/0.053/0.102 | 0.035/0.045/0.060/0.115 | 0.032/0.041/0.055/0.106 |
| happyhorse-1.1（/s） | 720p/1080p | 0.14/0.18 | 同官方 | 0.129/0.167 |
| gpt-image-2.5（/张） | 1K/2K/4K | 无按张价 | high 0.053/0.055/0.100 | 0.0345/0.0575/0.092 |
| gpt-image-2（/张） | 1K/2K/4K | high 0.211/无/无 | high 0.211/0.222/0.401 | 0.0345/0.0575/0.092 |
| nano-banana-pro（/张） | 1K/2K/4K | 0.134/0.134/0.24 | 0.15/0.15/0.30 | 0.1035/0.1035/0.138 |
| nano-banana-2（/张） | 1K/2K/4K | 0.067/0.101/0.151 | 0.08/0.12/0.16 | 0.046/0.069/0.1035 |
| nano-banana-2.1（/张） | 1K/2K/4K | 0.0336/0.0504/0.113 | ≈0.040/0.059/0.134 | 0.023/0.0345/0.0518 |
| seedream-5-pro（/张） | 1K/2K/额外输入图 | 0.045/0.09/0.003 | 0.0675/0.135/0.0045 | 0.040/0.0805/0.0029 |
| flux-2-pro（/张） | 1K/2K | 0.03/0.075 | 0.03/0.075 | 0.0288/0.0403 |
| flux-2-flex（/张） | 1K/2K | 0.05/0.20 | 0.05/0.20 | 0.0805/0.138 |
| imagen-4（/张） | fast/standard/ultra | 0.02/0.04/0.06 | 未上架 | 0.023/0.046/0.069 |
| ideogram-v3（/张） | turbo/balanced/quality | 0.03/0.06/0.09 | 0.03/0.06/0.09 | 0.020/0.040/0.0575 |
| qwen-image-3（/张） | 1K/2K | 0.03/0.03 | 未上架 | 0.0276/0.0276 |
| qwen-image-3-pro（/张） | 1K/2K | 0.04/0.075 | 0.075/0.075 | 0.0368/0.069 |
| claude-opus-5-5（/1M） | 输入/输出 | 4/20 | — | 4/20 |
| gpt-5.5（/1M） | 输入/输出 | 5/30 | — | 1.6/8 |
| gemini-3-pro（/1M，按 3.1 Pro） | 输入/输出 | 2/12 | — | 1.92/9.6 |
