# chuni-judgement

可独立部署的判定图项目：上传**C2S 谱面文件**，预览和下载带判定范围的 SVG。也提供本地 CLI、SVG / HTML 库接口与 HTTP API。零运行时依赖，Node.js 18+。

## 独立部署

```sh
mkdir -p charts
# 放入你提供的C2S 谱面，例如 charts/1086_03.c2s
docker compose up -d --build
# 打开 http://localhost:3000
```

或直接运行 `npm start`，默认监听 `127.0.0.1:3000`；可通过 `HOST`、`PORT` 调整。Compose 默认只绑定本机端口，可通过自己的反向代理发布。无需数据库、账户、谱面服务或 API 密钥。上传文件不写磁盘，渲染结果不持久化。

`GET /healthz` 提供健康检查。`POST /api/render?format=svg` 接收 `text/plain` 的 C2S 内容，返回 SVG；`format=html` 返回完整 HTML。可选参数：`easy=1`、`protection=0`、`scale=560`、`column=4.5`。

服务限制：请求体 2 MiB、最多两个并行渲染、每次 15 秒，计算在独立 worker 中进行。浏览器 UI 只调用同源 API。

## 网页参数调用 / Bot 集成

将谱面按 `歌曲ID_难度.c2s` 命名，歌曲 ID 至少补足四位；难度 `00` BASIC、`01` ADVANCED、`02` EXPERT、`03` MASTER、`04` ULTIMA、`05` WORLD’S END。Compose 将 `./charts` 只读挂载为 `/charts`；直接运行时设置 `CHART_DIR=/path/to/charts`。

```text
/preview?name=1086_03                   # 完整判定图 HTML，直接供 Bot 截图
/preview?name=1086_03&judge=0           # 普通谱面预览
/api/render?name=1086_03               # GET，直接返回 SVG
/api/render?name=1086_03&format=html    # GET，返回完整 HTML
```

页面没有控制面板，只有谱面、颜色图例及左下角源码署名。截图目标为 `#chuni-judgement-render` 内的 SVG，其 width / height 给出完整尺寸；响应完成即渲染就绪，没有异步谱面请求。支持 `scale`、`column`、`protection`、`judge`、`easy` 参数；本地文件调用按难度自动选择 easy/hard，显式 `easy` 可覆盖。

缺少文件返回 404，文件名不合法返回 400，没有配置目录返回 503。文件访问限制在配置目录内，拒绝路径穿越和指向目录外的符号链接。服务只读取部署者放入的文件，不自动获取网上谱面。上传入口始终可用，不依赖本地目录。

## 本地转换

```sh
node bin/render.cjs chart.c2s judgement.svg
node bin/render.cjs chart.c2s judgement.html
node bin/render.cjs chart.c2s judgement.svg --easy
npm test
```

```js
const { parseC2S, renderSvg } = require('./src');
const fs = require('node:fs');
const chart = parseC2S(fs.readFileSync('chart.c2s', 'utf8'));
const svg = renderSvg(chart, { pixelsPerSecond: 560, secondsPerColumn: 4.5 });
fs.writeFileSync('chart.svg', svg);
```

只读取调用者提供的本地 C2S 文件。没有谱面下载器或浏览器采集逻辑，也不附带真实谱面文件。

## 判定和显示

- 黄色：JUSTICE CRITICAL；橙色：JUSTICE；绿色：ATTACK。
- Critical 起点有效区域全部为 JC。普通地面起点按 16 格计算重叠保护，但仅绘制每颗 note 的外边界，不画内部格线。
- 蓝色斜线：FLICK 的触摸入口，不是最终滑动判定。
- 读取小数 BPM，按 BPM 事件分段积分生成实际秒数，不从显示标签或像素反推时间。
- 原始 note、HOLD、SLIDE、AIR 系列路径保留显示；持续按压、空中动作和 FLICK 移动历史不做输入模拟。
- 普通配置地面 JC ±33.333 ms、JUSTICE 外界 ±66.667 ms、ATTACK 外界 ±83.333 ms；`--easy` 的 ATTACK 外界为 ±100 ms。
- 这是所参考 UMIGURI 实现的静态候选窗口，不保证与街机规则完全一致；也不决定一次输入最终会被哪颗音符消耗。
- 纵轴线性对应时间，忽略滚速演出；跨列路径会裁切显示。暂不渲染游戏中的 3D 高度和曲线插值演出。
- 元数据名称不插入 SVG，数值字段经过验证；不支持无效格式、缺少初始 BPM 或非整数地面轨道的输入。

上游格式参考：[QingQiz/MarisaBot](https://github.com/QingQiz/MarisaBot)。判定行为参考：[pingfanH/umiguri-re](https://github.com/pingfanH/umiguri-re)。详细来源和修改声明见 [NOTICE](NOTICE)。

## 许可

**AGPL-3.0-only**，完整文本见 [LICENSE](LICENSE)。保留原开源项目的作者及许可声明。
