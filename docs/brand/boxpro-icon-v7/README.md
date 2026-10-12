# BoxPro 图标 v7 · 顶部光环柔化

使用内置 image_gen 工具编辑 v6 图标，减弱外圈顶部蓝绿渐变的饱和度与光晕，使顶部过渡更柔和。保留服务器、延迟曲线、深色底板及其他环段的设计。

主图：`icon-original.png`。通过 macOS sips 导出 1024、512、192、180、64、32px PNG 和 32px favicon.ico。底板外部透明，内部深色。未接入主题。

## 完整编辑提示词

```text
Use case: precise-object-edit.
Input image: edit target, approved BoxPro server monitoring app icon.
Primary request: Make ONLY the gradient colors along the TOP ARC of the OUTER thick luminous circular ring softer, paler and less intense. Reduce saturation and glow intensity modestly, roughly 25–35 percent, across the upper arc from about 10 o'clock through 12 o'clock to 2 o'clock. Use a gentle muted mint-to-soft teal/cyan transition and a slightly less bright edge, with a gradual seamless blend back to the existing side arcs. The arc should remain clearly visible and circular. It should feel subtle and soft, not gray or washed out.
Critical edit boundaries: adjust ONLY this upper portion of the outer thick ring and its immediate emitted glow. Do not dim the whole icon. Do not change the rest of the outer ring, the inner thin ring, the server rack, the three drawers and their LEDs, the latency waveform crossing the servers, waveform sample dot, vertical bars or diagonal scan spoke, dark navy rounded-square tile, tile highlights or tile dimensions. Preserve identical geometry, framing, proportions, structure, edge positions and composition.
Invariants: retain the original detailed polished metal/glass style, original navy tile, original blue/green/cyan identity everywhere else. Genuine alpha transparency outside the rounded-square tile; opaque dark surface inside the tile. One icon only.
Constraints: no extra objects, no text, no watermark, no new background, no shadow outside tile. This is a small localized color refinement of the provided icon, not a redesign.
```

