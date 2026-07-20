# 招行企业贷款简易测算报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将融资咨询表单变成可保存、可展示、可导出的招行企业贷款简易测算闭环。

**Architecture:** 新建无副作用的测算模块，浏览器和 Node 服务端都调用同一份规则。后端在持久化前重算结果，前端只展示 API 返回的最终报告；后台列表和 Excel 使用已保存的结果字段。

**Tech Stack:** React 19、Vite 6、Node.js HTTP 服务、JSON 文件存储、HTML Excel 导出。

## Global Constraints

- 六项维度、评分阈值和额度区间完全采用已确认的招行简易模型。
- 评分仅用于初步参考，页面和导出数据不构成放款承诺。
- 不增加第三方依赖；保持客户后台与客户站点隔离。

---

### Task 1: 共享测算规则

**Files:**
- Create: `src/lib/creditEstimator.js`
- Modify: `server/index.mjs`

**Interfaces:**
- Produces: `calculateCreditEstimate(input)`，返回 `{ score, band, referenceAmount, breakdown, debtPenalty, summary }`。
- Consumes: 六个选择项以及 `debtOverRevenue70` 布尔值。

- [x] **Step 1: 写入规则常量和计算函数**

```js
export function calculateCreditEstimate(input) {
  const breakdown = DIMENSIONS.map(({ key, options }) => ({
    key,
    ...options.find((option) => option.value === input[key]),
  }));
  const rawScore = breakdown.reduce((total, item) => total + (item?.score || 0), 0);
  const debtPenalty = input.debtOverRevenue70 === "yes" ? 10 : 0;
  const score = Math.max(0, Math.min(100, rawScore - debtPenalty));
  return { score, debtPenalty, breakdown, ...getBand(score) };
}
```

- [x] **Step 2: 让服务端在保存前重算报告**

```js
const estimate = calculateCreditEstimate(lead);
return { id, createdAt, ...lead, estimate };
```

- [x] **Step 3: 验证典型样本**

运行：`node --input-type=module -e "import { calculateCreditEstimate } from './src/lib/creditEstimator.js'; console.log(calculateCreditEstimate({ ... }))"`

预期：标准样本为 42 分，顶额样本为 100 分，超负债样本扣除 10 分。

### Task 2: 客户表单与即时报告

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `calculateCreditEstimate` 与其 `DIMENSIONS` 选项定义。
- Produces: `CreditEstimateReport`，展示 API 返回的最终估算结果。

- [x] **Step 1: 将原先六个经营字段替换为模型字段**

```jsx
{creditDimensions.map(({ key, label, options }) => (
  <label key={key}>
    <span>{label}</span>
    <select required value={form[key]} onChange={(event) => updateField(key, event.target.value)}>
      <option value="" disabled>请选择</option>
      {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>
))}
```

- [x] **Step 2: 在提交成功后展示报告**

```jsx
setEstimate(payload.lead.estimate);
setStatus({ type: "success", message: "信息已提交，以下为您的初步测算结果。" });
```

- [x] **Step 3: 添加报告视觉和响应式样式**

报告使用总分和参考额度作为主要层级，六项得分采用紧凑网格，扣分项只在触发时显示；固定合规文案始终位于报告底部。

- [x] **Step 4: 构建验证**

运行：`node ./node_modules/vite/bin/vite.js build`

预期：构建成功且生成 `dist`。

### Task 3: 后台列表和 Excel 字段

**Files:**
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: 每条 lead 的 `estimate`。
- Produces: 后台表格与 Excel 的 `测算总分`、`参考额度`、`额度区间` 字段。

- [x] **Step 1: 扩展导出列**

```js
["estimate.score", "测算总分"],
["estimate.referenceAmount", "测算参考额度"],
["estimate.band", "测算额度区间"],
```

- [x] **Step 2: 扩展后台表格列**

在数据表中展示评分、参考额度与区间；旧数据无报告时显示 `-`，避免历史资料无法读取。

- [x] **Step 3: API 验证**

运行后向 `POST /api/leads` 提交完整样本，再使用带后台口令的 `GET /api/leads` 和 `GET /api/leads/export` 验证保存和导出字段。

### Task 4: 最终验证与提交

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-cmb-credit-estimator-design.md`
- Modify: `docs/superpowers/plans/2026-07-20-cmb-credit-estimator.md`

- [x] **Step 1: 使用桌面与手机视口检查表单及报告**

确认报告文字不溢出，提交状态可见，滚动定位自然。

- [x] **Step 2: 运行后端语法检查和前端构建**

运行：`node --check server/index.mjs` 和 `node ./node_modules/vite/bin/vite.js build`

预期：均成功。

- [x] **Step 3: 更新计划勾选并提交**

```bash
git add src server docs
git commit -m "Add CMB credit estimate report"
```
