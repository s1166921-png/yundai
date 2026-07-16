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

const heroContent = {
  nav: "云贷方案",
  name: "云贷资金指挥舱",
  badge: "Meiou × CCB Cloud Loan",
  title: "美鸥平台云贷，跨境卖家专属资金解决方案",
  subtitle: "依托美鸥跨境物流、仓储、店铺经营全量真实数据做风控，联合建行为跨境小微商家提供货押贷与应收贷融资支持。",
  cta: "查看两大产品",
  altCta: "预约融资顾问",
};

const flowSteps = [
  ["01", "经营数据接入", "物流、仓储、店铺销售、回款等多维数据加固直连。"],
  ["02", "美鸥风控建模", "根据货值、账期、评级、报关额与经营稳定性形成授信画像。"],
  ["03", "建行线上审批", "授信申请、数据核验、审批放款全流程线上操作。"],
  ["04", "贷后闭环管理", "货权水位、平台回款、资金用途与还款节奏持续跟踪。"],
];

const proofBadges = ["建行联合方案", "美鸥数据风控", "最高 1000 万", "线上审批放款"];

const leadOptionGroups = [
  {
    name: "annualRevenue",
    label: "去年全年营业收入",
    options: ["500-1000万", "1000万-3000万", "3000万-5000万", "5000万-1亿", "1亿以上"],
  },
  {
    name: "annualProfit",
    label: "去年全年净利润",
    options: ["0-100万", "100万-300万", "300万-1000万", "1000万以上"],
  },
  {
    name: "revenueGrowth",
    label: "预计今年营收比去年增速",
    options: ["0-10%", "10%-30%", "30-50%", "50%以上"],
  },
  {
    name: "employeeCount",
    label: "当前员工人数",
    options: ["0-10人", "10-20人", "20-50人", "50人以上"],
  },
  {
    name: "bankCount",
    label: "贷款合作银行家数",
    options: ["0", "1", "2", "3", "3家以上"],
  },
  {
    name: "desiredAmount",
    label: "本次融资意向金额",
    options: ["50-100万", "100-300万", "300-500万", "500万以上"],
  },
];

const initialLeadForm = {
  companyName: "",
  contactName: "",
  phone: "",
  platform: "",
  productInterest: "",
  annualRevenue: "",
  annualProfit: "",
  revenueGrowth: "",
  employeeCount: "",
  bankCount: "",
  desiredAmount: "",
  note: "",
};

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
      <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Site navigation">
        <a className="active" href="#top">首页</a>
        <a href="#ecosystem">生态数据</a>
        <a href="#scenes">融资场景</a>
        <a href="#products">产品卖点</a>
        <a href="#contact">立即咨询</a>
        <a href="#admin">后台</a>
      </nav>
      <div className="nav-actions">
        <a className="ghost-button" href="#products">产品卖点</a>
        <a className="hot-button small" href="#contact">立即咨询</a>
      </div>
    </header>
  );
}

function HeroVisual() {
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

function LeadForm() {
  const [form, setForm] = useState(initialLeadForm);
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitLead = async (event) => {
    event.preventDefault();
    setStatus({ type: "loading", message: "正在提交融资意向..." });

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "提交失败，请稍后再试");
      }

      setForm(initialLeadForm);
      setStatus({ type: "success", message: "提交成功，我们会尽快联系您确认融资方案。" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "提交失败，请稍后再试" });
    }
  };

  return (
    <section id="contact" className="lead-section cloud-cta">
      <div className="lead-copy">
        <p className="eyebrow">financing intake</p>
        <h2>提交经营信息，获取平台云贷初步匹配方案</h2>
        <p className="section-copy">
          客户填写后会进入后台客户信息汇总，管理员可以查看全部记录并一键导出 Excel。
        </p>
      </div>

      <form className="lead-form" onSubmit={submitLead}>
        <div className="form-grid">
          <label>
            <span>企业名称</span>
            <input
              required
              value={form.companyName}
              onChange={(event) => updateField("companyName", event.target.value)}
              placeholder="请输入企业名称"
            />
          </label>
          <label>
            <span>联系人</span>
            <input
              required
              value={form.contactName}
              onChange={(event) => updateField("contactName", event.target.value)}
              placeholder="请输入联系人姓名"
            />
          </label>
          <label>
            <span>联系电话</span>
            <input
              required
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="请输入手机号码"
            />
          </label>
          <label>
            <span>主营平台</span>
            <select required value={form.platform} onChange={(event) => updateField("platform", event.target.value)}>
              <option value="" disabled>请选择主营平台</option>
              <option>Amazon</option>
              <option>Temu</option>
              <option>TikTok Shop</option>
              <option>多平台经营</option>
              <option>其他</option>
            </select>
          </label>
          <label>
            <span>意向产品</span>
            <select
              required
              value={form.productInterest}
              onChange={(event) => updateField("productInterest", event.target.value)}
            >
              <option value="" disabled>请选择意向产品</option>
              <option>货押贷</option>
              <option>应收贷</option>
              <option>两类都想了解</option>
            </select>
          </label>
        </div>

        <div className="option-groups">
          {leadOptionGroups.map((group) => (
            <fieldset key={group.name} className="option-group">
              <legend>{group.label}</legend>
              <div>
                {group.options.map((option) => (
                  <label key={option} className={form[group.name] === option ? "selected" : ""}>
                    <input
                      required
                      type="radio"
                      name={group.name}
                      value={option}
                      checked={form[group.name] === option}
                      onChange={(event) => updateField(group.name, event.target.value)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <label className="full-field">
          <span>补充说明</span>
          <textarea
            value={form.note}
            onChange={(event) => updateField("note", event.target.value)}
            placeholder="可填写库存、回款周期、当前融资需求等补充信息"
          />
        </label>

        <div className="form-actions">
          <button className="hot-button" type="submit" disabled={status.type === "loading"}>
            {status.type === "loading" ? "提交中..." : "提交融资意向"}
          </button>
          {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
        </div>
      </form>
    </section>
  );
}

function AdminPanel() {
  const [token, setToken] = useState("");
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("");

  const loadLeads = async () => {
    setStatus("正在读取客户信息...");
    try {
      const response = await fetch(`/api/leads?token=${encodeURIComponent(token)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "读取失败");
      }

      setLeads(payload.leads);
      setStatus(`已读取 ${payload.leads.length} 条客户信息`);
    } catch (error) {
      setStatus(error.message || "读取失败");
    }
  };

  const exportUrl = `/api/leads/export?token=${encodeURIComponent(token)}`;

  return (
    <section id="admin" className="admin-panel" aria-label="Lead admin panel">
      <div>
        <p className="eyebrow">admin</p>
        <h2>客户信息后台</h2>
        <p className="section-copy">输入后台口令后可以查看客户提交记录，并一键导出 Excel 汇总表。</p>
      </div>
      <div className="admin-tools">
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="后台口令"
        />
        <button type="button" onClick={loadLeads}>读取客户信息</button>
        <a className={token ? "" : "disabled"} href={token ? exportUrl : "#admin"}>导出 Excel</a>
      </div>
      {status && <p className="admin-status">{status}</p>}
      <div className="lead-table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>提交时间</th>
              <th>企业名称</th>
              <th>联系人</th>
              <th>电话</th>
              <th>主营平台</th>
              <th>意向金额</th>
              <th>营收</th>
              <th>净利润</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="8">暂无已读取数据</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{new Date(lead.createdAt).toLocaleString("zh-CN")}</td>
                  <td>{lead.companyName}</td>
                  <td>{lead.contactName}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.platform}</td>
                  <td>{lead.desiredAmount}</td>
                  <td>{lead.annualRevenue}</td>
                  <td>{lead.annualProfit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function App() {
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
            <span>{heroContent.nav}</span>
            <strong>{heroContent.name}</strong>
          </div>
          <div className="ai-pill">
            <span>{heroContent.badge}</span>
            <b>跨境卖家专属资金解决方案</b>
          </div>
          <h1>
            {heroContent.title.split("，")[0]}
            <span>{heroContent.title.split("，").slice(1).join("，") || "专属融资护航跨境经营"}</span>
          </h1>
          <p className="hero-text">{heroContent.subtitle}</p>
          <div className="feature-strip" aria-label="Core advantages">
            <span>真实数据风控</span>
            <span>最高 1000 万</span>
            <span>全国一体化办理</span>
            <span>全流程线上化</span>
          </div>
          <div className="hero-actions">
            <a className="hot-button" href="#products">{heroContent.cta}</a>
            <a className="outline-button" href="#contact">{heroContent.altCta}</a>
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

        <HeroVisual />
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

      <LeadForm />

      <AdminPanel />
    </main>
  );
}
