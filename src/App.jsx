import { useMemo, useState } from "react";
import fundingNetwork from "./assets/funding-network.png";
import inventoryPledge from "./assets/inventory-pledge.png";
import receivablesFlow from "./assets/receivables-flow.png";
import riskEngine from "./assets/risk-engine.png";

const commonAdvantages = [
  ["1000万", "单笔授信最高额度"],
  ["全国办理", "一点对全国运营"],
  ["全流程线上", "申请、核验、审批、放款"],
  ["到期还本付息", "规则清晰，便于规划"],
];

const products = [
  {
    name: "货押贷",
    tag: "盘活在库 + 在途货物",
    headline: "把沉睡库存变成流动资金",
    limit: "最高 1000 万元",
    period: "最长 6 个月",
    bullets: [
      "以美鸥监管的在途货物、在仓库存质押融资",
      "出口满 1 年及以上，货值质押率最高 80%",
      "出口 3 个月至 1 年，货值质押率最高 60%",
      "受托支付结清仓储物流费用，剩余资金自主支配",
      "最低货值水位线闭环监管，货权管控更稳健",
    ],
  },
  {
    name: "应收贷",
    tag: "盘活平台店铺回款",
    headline: "提前释放平台账期里的现金流",
    limit: "最高 1000 万元",
    period: "最长 9 个月",
    bullets: [
      "依托亚马逊、Temu、TikTok Shop 店铺真实回款授信",
      "授信额度按近 3 个月月均平台回款与动态系数核定",
      "放款采用自主支付，备货、广告、新品铺货都可使用",
      "不用押货，不用额外不动产抵押",
      "凭真实经营流水与应收数据审批，更适合轻资产卖家",
    ],
  },
];

const platformTags = ["Amazon", "Temu", "TikTok Shop", "美鸥仓储", "跨境物流", "建行云贷"];

const templates = [
  {
    id: "command",
    nav: "云贷方案",
    name: "云贷资金指挥舱",
    description: "最接近之前 Dowsure 的科技感：首页用实时数据面板建立信任，适合作为正式官网首页方向。",
    badge: "Meiou × CCB Cloud Loan",
    title: "美鸥平台云贷，跨境卖家专属资金解决方案",
    subtitle: "依托美鸥跨境物流、仓储、店铺经营全量真实数据做风控，联合建行为跨境小微商家提供货押贷与应收贷融资支持。",
    cta: "查看两大产品",
    altCta: "预约融资顾问",
    visual: "dashboard",
  },
  {
    id: "matrix",
    nav: "模板 02",
    name: "双产品对比矩阵",
    description: "信息解释最清晰：把货押贷和应收贷并排讲透，适合销售转化页或投放落地页。",
    badge: "Inventory + Receivable Financing",
    title: "货物、应收、店铺数据，一次转成经营资金",
    subtitle: "用一套云贷产品矩阵覆盖备货垫资、仓储周转、平台账期与多店铺扩张需求，让资金安排更有确定性。",
    cta: "选择适合我的产品",
    altCta: "下载产品方案",
    visual: "matrix",
  },
  {
    id: "flow",
    nav: "模板 03",
    name: "风控数据增长引擎",
    description: "最强调美鸥数据能力：突出物流、仓储、店铺经营数据如何进入建行审批链路。",
    badge: "Data Risk Engine",
    title: "美鸥风控赋能云贷，专属融资护航跨境经营",
    subtitle: "以真实经营数据连接银行授信，从申请、数据核验、审批放款到贷后管理，全链路线上化完成。",
    cta: "查看办理流程",
    altCta: "了解准入条件",
    visual: "flow",
  },
];

const flowSteps = [
  ["01", "经营数据接入", "物流、仓储、店铺销售、回款等多维数据加固直连。"],
  ["02", "美鸥风控建模", "根据货值、账期、评级、报关额与经营稳定性形成授信画像。"],
  ["03", "建行线上审批", "授信申请、数据核验、审批放款全流程线上操作。"],
  ["04", "贷后闭环管理", "货权水位、平台回款、资金用途与还款节奏持续跟踪。"],
];

const proofBadges = ["建行联合方案", "美鸥数据风控", "最高 1000 万", "线上审批放款"];

const liveSignals = [
  ["库存水位", "78%", "货押贷"],
  ["回款预测", "92%", "应收贷"],
  ["准入评分", "A+", "风控"],
];

const financingScenes = [
  {
    id: "inventory",
    kicker: "scene 01 / inventory pledge",
    title: "货押贷：把在库与在途货物变成可授信资产",
    body: "围绕美鸥监管仓、跨境在途货物与最低货值水位线，建立货权、货值、仓储物流费用的闭环监管，让库存不再只是占用现金流的沉默资产。",
    image: inventoryPledge,
    imageAlt: "库存质押仓储融资概念图",
    metrics: [
      ["80%", "满 1 年出口货值质押率最高"],
      ["60%", "3 个月至 1 年出口货值质押率最高"],
      ["6 个月", "贷款期限最长"],
    ],
    points: ["在途货物与在仓库存均可纳入风控", "受托支付结清仓储物流费用", "最低货值水位线持续监控"],
  },
  {
    id: "receivables",
    kicker: "scene 02 / receivables finance",
    title: "应收贷：提前释放平台账期里的经营现金流",
    body: "依托平台店铺真实回款、近 3 个月月均流水与动态系数核定授信额度，让跨境卖家在备货、广告、新品铺货和多店扩张时有更确定的资金安排。",
    image: receivablesFlow,
    imageAlt: "平台应收回款融资概念图",
    metrics: [
      ["9 个月", "贷款期限最长"],
      ["1000 万", "单笔授信最高"],
      ["线上化", "申请审批放款"],
    ],
    points: ["不用押货，不用额外不动产抵押", "按真实平台回款能力核定额度", "自主支付覆盖多类经营用途"],
  },
  {
    id: "risk",
    kicker: "scene 03 / risk engine",
    title: "数据风控：把物流、仓储、店铺与银行审批串成一条线",
    body: "美鸥沉淀跨境经营数据，建行承接线上审批链路，从申请、核验、放款到贷后管理形成连续监测，减少传统抵押不足带来的融资摩擦。",
    image: riskEngine,
    imageAlt: "贷后监控与风控数据引擎概念图",
    metrics: [
      ["A+", "经营画像动态评级"],
      ["LIVE", "水位与回款持续监测"],
      ["全国", "跨区域经营统一办理"],
    ],
    points: ["物流、仓储、店铺销售、回款多源交叉验证", "授信画像与贷后监控动态更新", "异常水位和回款波动及时预警"],
  },
];

const colorDirections = [
  {
    id: "clear-blue",
    name: "清透金融蓝",
    mood: "更明亮、可信、银行科技感强",
    bg: "linear-gradient(145deg, #f5fbff 0%, #e8f4ff 48%, #dff8f3 100%)",
    ink: "#0f2542",
    muted: "#506983",
    accent: "#1e8fff",
    second: "#20c6a8",
    button: "linear-gradient(100deg, #1e8fff, #20c6a8)",
  },
  {
    id: "clear-violet-cyan",
    name: "清透紫青蓝",
    mood: "在清透金融蓝基础上加入现代紫青渐变，更有科技平台感",
    bg: "linear-gradient(145deg, #f7fbff 0%, #edf4ff 42%, #e7fbfb 100%)",
    ink: "#10244a",
    muted: "#556d8d",
    accent: "#8c52ff",
    second: "#5ce1e6",
    button: "linear-gradient(90deg, #8c52ff, #5ce1e6)",
  },
  {
    id: "mint-coral",
    name: "薄荷青橙",
    mood: "更年轻、跨境电商感更轻快",
    bg: "linear-gradient(145deg, #f3fff9 0%, #e8fbf4 48%, #fff2e8 100%)",
    ink: "#12332f",
    muted: "#5b706b",
    accent: "#00a98f",
    second: "#ff8a5b",
    button: "linear-gradient(100deg, #00a98f, #ff9b62)",
  },
  {
    id: "soft-slate",
    name: "云白深青",
    mood: "高级、干净、适合正式官网",
    bg: "linear-gradient(145deg, #f7f8f6 0%, #eef4f1 52%, #e3eee9 100%)",
    ink: "#162923",
    muted: "#64746d",
    accent: "#0d7667",
    second: "#c89b4f",
    button: "linear-gradient(100deg, #0d7667, #d7ad62)",
  },
  {
    id: "rose-gold",
    name: "曜石玫瑰金",
    mood: "保留高级暗色，但更柔和不压抑",
    bg: "linear-gradient(145deg, #151617 0%, #1f2628 50%, #2b1f24 100%)",
    ink: "#fff8ef",
    muted: "#d7c9bd",
    accent: "#f2b37d",
    second: "#74d7ca",
    button: "linear-gradient(100deg, #f2b37d, #74d7ca)",
  },
  {
    id: "ember-orange",
    name: "曜石暖橙",
    mood: "在暗色高级感里加入更现代的活力橙",
    bg: "linear-gradient(145deg, #101418 0%, #172126 44%, #2a1c13 100%)",
    ink: "#fff7eb",
    muted: "#d9c8b5",
    accent: "#ff8a35",
    second: "#4ed6c7",
    button: "linear-gradient(100deg, #ff8a35, #4ed6c7)",
  },
  {
    id: "amber-tech",
    name: "琥珀科技橙",
    mood: "更像金融科技产品，橙色有温度但不土",
    bg: "linear-gradient(145deg, #11191b 0%, #10282a 48%, #332312 100%)",
    ink: "#fff9ef",
    muted: "#c9d0c8",
    accent: "#ffb13b",
    second: "#32d0b2",
    button: "linear-gradient(100deg, #ffb13b, #32d0b2)",
  },
  {
    id: "coral-graphite",
    name: "珊瑚石墨",
    mood: "年轻、利落，适合跨境电商客户群",
    bg: "linear-gradient(145deg, #f8f3ee 0%, #f0f6f3 46%, #ffe1cf 100%)",
    ink: "#202a2c",
    muted: "#65716f",
    accent: "#ff7448",
    second: "#0f9f8b",
    button: "linear-gradient(100deg, #ff7448, #0f9f8b)",
  },
  {
    id: "sunset-credit",
    name: "日落信贷橙",
    mood: "更有营销转化感，适合融资咨询落地页",
    bg: "linear-gradient(145deg, #fff8ef 0%, #f7f1e9 45%, #ffd9b8 100%)",
    ink: "#2b241f",
    muted: "#716359",
    accent: "#ff7a1a",
    second: "#196f63",
    button: "linear-gradient(100deg, #ff7a1a, #196f63)",
  },
];

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="nav">
      <a className="brand meiou" href="#top" aria-label="Meiou Cloud Loan home">
        <span className="brand-mark">M</span>
        <span>美鸥云贷</span>
      </a>
      <button
        className="menu-button"
        type="button"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Template navigation">
        <a className="active" href="#top">首页</a>
        <a href="#ecosystem">生态数据</a>
        <a href="#colors">配色试样</a>
        <a href="#sample">页面样稿</a>
        <a href="#scenes">融资场景</a>
        <a href="#products">产品卖点</a>
        <a href="#contact">立即咨询</a>
      </nav>
      <div className="nav-actions">
        <a className="ghost-button" href="#products">产品卖点</a>
        <a className="hot-button small" href="#contact">立即咨询</a>
      </div>
    </header>
  );
}

function HeroVisual({ type }) {
  if (type === "matrix") {
    return (
      <aside className="loan-matrix" aria-label="Loan product comparison">
        {products.map((product) => (
          <article key={product.name} className="matrix-card">
            <span>{product.tag}</span>
            <h3>{product.name}</h3>
            <p>{product.headline}</p>
            <div className="matrix-stats">
              <strong>{product.limit}</strong>
              <strong>{product.period}</strong>
            </div>
          </article>
        ))}
        <div className="matrix-orbit">
          <i />
          <i />
          <i />
          <b>云贷</b>
          <span>美鸥数据风控</span>
        </div>
      </aside>
    );
  }

  if (type === "flow") {
    return (
      <aside className="flow-console" aria-label="Risk control workflow">
        <div className="console-topline">
          <span>ONLINE CREDIT FLOW</span>
          <strong>LIVE</strong>
        </div>
        <div className="risk-radar" aria-hidden="true">
          {liveSignals.map(([label, value, typeName]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
              <small>{typeName}</small>
            </div>
          ))}
        </div>
        <div className="flow-lane">
          {flowSteps.map(([step, title, body]) => (
            <article key={step}>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="command-center cloud-loan" aria-label="Meiou cloud loan command center">
      <div className="panel-header">
        <span>跨境资金云图</span>
        <strong>LIVE</strong>
        <button type="button">全国视图</button>
      </div>
      <div className="map-stage">
        <img src={fundingNetwork} alt="Cross-border funding network" />
        <div className="pulse-node primary" />
        <div className="pulse-node secondary" />
        <div className="pulse-node tertiary" />
        <div className="marketplace-tags left">
          <span>Amazon</span>
          <span>Temu</span>
          <span>TikTok Shop</span>
        </div>
        <div className="marketplace-tags right">
          <span>货押贷</span>
          <span>应收贷</span>
          <span>建行云贷</span>
        </div>
      </div>
      <div className="signal-cards">
        <button className="signal-card active" type="button">
          <span>授信额度</span>
          <strong>1000 万</strong>
          <small>单笔最高</small>
        </button>
        <button className="signal-card" type="button">
          <span>货值质押率</span>
          <strong>80%</strong>
          <small>满 1 年最高</small>
        </button>
        <button className="signal-card" type="button">
          <span>应收周期</span>
          <strong>9 个月</strong>
          <small>最长贷款期限</small>
        </button>
        <button className="signal-card shield" type="button">
          <span>办理方式</span>
          <strong>线上化</strong>
          <small>审批放款高效</small>
        </button>
      </div>
    </aside>
  );
}

function ColorDirectionLab() {
  return (
    <section id="colors" className="color-lab" aria-label="Color direction previews">
      <div className="section-heading">
        <p className="eyebrow">color direction lab</p>
        <h2>当前整站已套用清透紫青蓝，其他方向保留为备选</h2>
        <p className="section-copy">
          以清透金融蓝为底，加入 90 度紫青渐变：页面更明亮、更现代，也保留银行科技产品需要的可信感。
        </p>
      </div>

      <div className="color-options">
        {colorDirections.map((direction) => (
          <article
            key={direction.id}
            className={`color-card color-${direction.id}`}
            style={{
              "--preview-bg": direction.bg,
              "--preview-ink": direction.ink,
              "--preview-muted": direction.muted,
              "--preview-accent": direction.accent,
              "--preview-second": direction.second,
              "--preview-button": direction.button,
            }}
          >
            <div className="color-preview">
              <div className="preview-copy">
                <span>{direction.name}</span>
                <h3>美鸥平台云贷</h3>
                <p>{direction.mood}</p>
                <button type="button">查看产品方案</button>
              </div>
              <div className="preview-panel">
                <div>
                  <strong>1000 万</strong>
                  <span>最高授信</span>
                </div>
                <div>
                  <strong>80%</strong>
                  <span>货值质押率</span>
                </div>
              </div>
            </div>
            <div className="color-meta">
              <strong>{direction.name}</strong>
              <p>{direction.mood}</p>
              <div className="swatches" aria-label={`${direction.name} swatches`}>
                <i style={{ background: direction.ink }} />
                <i style={{ background: direction.accent }} />
                <i style={{ background: direction.second }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VioletCyanSample() {
  return (
    <section id="sample" className="violet-sample" aria-label="Clear violet cyan page sample">
      <div className="sample-hero">
        <div className="sample-copy">
          <p className="sample-kicker">清透紫青蓝页面样稿</p>
          <h2>让跨境经营数据，直接变成可申请的银行授信</h2>
          <p>
            面向 Amazon、Temu、TikTok Shop 等跨境卖家，把店铺经营、物流履约、仓储货值与回款节奏整理成银行可识别的授信材料。
          </p>
          <div className="sample-actions">
            <a className="sample-primary" href="#contact">预约融资顾问</a>
            <a className="sample-secondary" href="#products">查看产品额度</a>
          </div>
        </div>

        <div className="sample-console">
          <div className="sample-console-head">
            <span>MEIOU CREDIT SNAPSHOT</span>
            <strong>READY</strong>
          </div>
          <div className="sample-limit">
            <span>预估可申请额度</span>
            <strong>¥ 1,000 万</strong>
            <small>货押贷 / 应收贷 / 平台经营数据辅助授信</small>
          </div>
          <div className="sample-progress" aria-hidden="true">
            <i />
          </div>
          <div className="sample-data-grid">
            <div>
              <strong>80%</strong>
              <span>最高质押率</span>
            </div>
            <div>
              <strong>9 个月</strong>
              <span>最长周期</span>
            </div>
            <div>
              <strong>线上化</strong>
              <span>申请审批</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sample-bottom">
        <div className="sample-steps">
          {[
            ["01", "提交经营信息", "店铺、物流、仓储、回款数据先完成基础核验。"],
            ["02", "匹配云贷产品", "根据库存质押或应收账款场景选择合适融资路径。"],
            ["03", "银行线上审批", "建行侧完成授信审批，形成可追踪的申请进度。"],
          ].map(([step, title, body]) => (
            <article key={step}>
              <span>{step}</span>
              <strong>{title}</strong>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <form className="sample-form" aria-label="Customer information sample form">
          <div>
            <label htmlFor="sample-company">企业名称</label>
            <input id="sample-company" type="text" placeholder="请输入企业名称" />
          </div>
          <div>
            <label htmlFor="sample-platform">主营平台</label>
            <select id="sample-platform" defaultValue="">
              <option value="" disabled>选择平台</option>
              <option>Amazon</option>
              <option>Temu</option>
              <option>TikTok Shop</option>
              <option>多平台经营</option>
            </select>
          </div>
          <button type="button">获取初步方案</button>
        </form>
      </div>
    </section>
  );
}

function TemplateSection({ template, activeTemplate, setActiveTemplate }) {
  return (
    <section className="template-switcher" aria-label="Template selector">
      {templates.map((item) => (
        <button
          key={item.id}
          className={item.id === activeTemplate ? "selected" : ""}
          type="button"
          onClick={() => setActiveTemplate(item.id)}
        >
          <span>{item.nav}</span>
          <strong>{item.name}</strong>
          <small>{item.description}</small>
        </button>
      ))}
      <p className="current-note">当前预览：{template.name}</p>
    </section>
  );
}

function ProofRibbon() {
  return (
    <section className="proof-ribbon" aria-label="Cloud loan proof points">
      <div className="ribbon-track">
        {[...proofBadges, ...proofBadges].map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function ProductPanel() {
  const [active, setActive] = useState(products[0].name);
  const selected = useMemo(() => products.find((product) => product.name === active) ?? products[0], [active]);

  return (
    <section id="products" className="products cloud-products">
      <div className="section-heading">
        <p className="eyebrow">product matrix</p>
        <h2>两类融资产品，覆盖跨境卖家核心资金场景</h2>
        <p className="section-copy">货押贷解决备货与库存占资，应收贷解决平台账期与轻资产授信。</p>
      </div>

      <div className="product-tabs" role="tablist" aria-label="Loan products">
        {products.map((product) => (
          <button
            key={product.name}
            className={active === product.name ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={active === product.name}
            onClick={() => setActive(product.name)}
          >
            {product.name}
          </button>
        ))}
      </div>

      <div className="loan-detail">
        <div className="loan-detail-main">
          <span>{selected.tag}</span>
          <h3>{selected.headline}</h3>
          <div className="loan-kpis">
            <strong>{selected.limit}</strong>
            <strong>{selected.period}</strong>
          </div>
        </div>
        <ul>
          {selected.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinancingScenes() {
  return (
    <section id="scenes" className="financing-scenes" aria-label="Financing scenes">
      <div className="section-heading">
        <p className="eyebrow">three financing scenes</p>
        <h2>三张核心概念图，把云贷产品讲成清晰的独立模块</h2>
        <p className="section-copy">
          不再把信息挤在一块：货押贷、应收贷、数据风控分别独立展开，每个模块都对应一个真实经营场景。
        </p>
      </div>

      <div className="scene-stack">
        {financingScenes.map((scene, index) => (
          <article key={scene.id} className={index % 2 === 1 ? "scene-panel reverse" : "scene-panel"}>
            <div className="scene-image">
              <img src={scene.image} alt={scene.imageAlt} />
              <div className="scene-badge">
                <span>{scene.kicker}</span>
                <strong>美鸥云贷</strong>
              </div>
            </div>
            <div className="scene-copy">
              <p className="eyebrow">{scene.kicker}</p>
              <h3>{scene.title}</h3>
              <p>{scene.body}</p>
              <div className="scene-metrics">
                {scene.metrics.map(([value, label]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <ul>
                {scene.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const template = templates[0];

  return (
    <main className="site-shell template-command final-template">
      <div className="ambient-layer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Header />

      <section id="top" className="hero cloud-hero">
        <div className="hero-copy">
          <div className="template-status">
            <span>{template.nav}</span>
            <strong>{template.name}</strong>
          </div>
          <div className="ai-pill">
            <span>{template.badge}</span>
            <b>跨境卖家专属资金解决方案</b>
          </div>
          <h1>
            {template.title.split("，")[0]}
            <span>{template.title.split("，").slice(1).join("，") || "专属融资护航跨境经营"}</span>
          </h1>
          <p className="hero-text">{template.subtitle}</p>
          <div className="feature-strip" aria-label="Core advantages">
            <span>真实数据风控</span>
            <span>最高 1000 万</span>
            <span>全国一体化办理</span>
            <span>全流程线上化</span>
          </div>
          <div className="hero-actions">
            <a className="hot-button" href="#products">{template.cta}</a>
            <a className="outline-button" href="#contact">{template.altCta}</a>
          </div>
          <dl className="hero-metrics">
            {commonAdvantages.map(([value, label]) => (
              <div key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual type={template.visual} />
      </section>

      <ProofRibbon />

      <section id="ecosystem" className="partner-rail cloud-rail" aria-label="Cloud loan ecosystem">
        <p>覆盖跨境卖家真实经营链路</p>
        {platformTags.map((tag) => (
          <button key={tag} type="button" className="partner-logo">
            <strong>{tag}</strong>
            <span>data source</span>
          </button>
        ))}
      </section>

      <ColorDirectionLab />

      <VioletCyanSample />

      <FinancingScenes />

      <section className="workflow cloud-workflow">
        <div>
          <p className="eyebrow">why it works</p>
          <h2>从经营数据到银行授信，一套链路跑通融资闭环</h2>
          <p className="section-copy">
            依托美鸥跨境物流、仓储与店铺经营数据，解决轻资产、缺传统抵押物、备货垫资和账期占用现金流的融资难题。
          </p>
        </div>
        <div className="flow-grid">
          {flowSteps.map(([step, title, body]) => (
            <article key={step} className="flow-card">
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <ProductPanel />

      <section id="contact" className="footer-cta cloud-cta">
        <div>
          <p className="eyebrow">next step</p>
          <h2>以云贷资金指挥舱为正式方向，继续深化成完整官网。</h2>
          <p className="section-copy">后续可以继续补官方品牌资产、咨询表单、更多银行背书、客户案例和移动端转化路径。</p>
        </div>
        <a className="hot-button" href="#top">回到顶部查看方案</a>
      </section>
    </main>
  );
}
