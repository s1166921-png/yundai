import { useMemo, useState } from "react";
import fundingNetwork from "./assets/funding-network.png";

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
    nav: "模板 01",
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

function Header({ activeTemplate, setActiveTemplate }) {
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
        {templates.map((template) => (
          <button
            key={template.id}
            className={activeTemplate === template.id ? "active" : ""}
            type="button"
            onClick={() => setActiveTemplate(template.id)}
          >
            {template.nav}
          </button>
        ))}
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

export function App() {
  const [activeTemplate, setActiveTemplate] = useState("command");
  const template = useMemo(
    () => templates.find((item) => item.id === activeTemplate) ?? templates[0],
    [activeTemplate],
  );

  return (
    <main className={`site-shell template-${template.id}`}>
      <div className="ambient-layer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Header activeTemplate={activeTemplate} setActiveTemplate={setActiveTemplate} />

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

      <section className="partner-rail cloud-rail" aria-label="Cloud loan ecosystem">
        <p>覆盖跨境卖家真实经营链路</p>
        {platformTags.map((tag) => (
          <button key={tag} type="button" className="partner-logo">
            <strong>{tag}</strong>
            <span>data source</span>
          </button>
        ))}
      </section>

      <TemplateSection
        template={template}
        activeTemplate={activeTemplate}
        setActiveTemplate={setActiveTemplate}
      />

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
          <h2>选定模板后，我可以继续把它做成完整官网。</h2>
          <p className="section-copy">你可以告诉我选择模板 01、02 或 03，我会基于选中的方向继续深化页面、动效和转化模块。</p>
        </div>
        <a className="hot-button" href="#top">回到顶部选择模板</a>
      </section>
    </main>
  );
}
