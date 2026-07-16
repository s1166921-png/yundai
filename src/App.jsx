import { useEffect, useMemo, useState } from "react";
import fundingNetwork from "./assets/funding-network.png";
import inventoryPledge from "./assets/inventory-pledge.png";
import receivablesFlow from "./assets/receivables-flow.png";
import riskEngine from "./assets/risk-engine.png";

const commonAdvantages = [
  ["2000万", "最高可贷额度"],
  ["低至3%", "综合费率"],
  ["最长1年", "灵活授信期限"],
  ["循环授信", "随用随贷"],
];

const products = [
  {
    name: "货押贷",
    tag: "盘活在库 + 在途货物",
    headline: "把沉睡库存变成流动资金",
    limit: "最高 2000 万元",
    period: "最长 1 年",
    bullets: [
      "以美鸥监管的在途货物、在仓库存质押融资",
      "出口满 1 年及以上，货值质押率最高 80%",
      "出口 3 个月至 1 年，货值质押率最高 60%",
      "受托支付结清仓储物流费用，剩余资金自主支配",
      "额度循环可用，适配备货、物流与旺季扩张",
    ],
  },
  {
    name: "应收贷",
    tag: "盘活平台店铺回款",
    headline: "提前释放平台账期里的现金流",
    limit: "最高 2000 万元",
    period: "综合费率低至 3%",
    bullets: [
      "依托亚马逊、Temu、TikTok Shop 店铺真实回款授信",
      "授信额度按近 3 个月月均平台回款与动态系数核定",
      "放款采用自主支付，备货、广告、新品铺货都可使用",
      "一次授信、循环使用，无需反复提交资料",
      "支持提前还款，无提前还款违约金",
    ],
  },
];

const platformTags = ["Amazon", "Temu", "TikTok Shop", "美鸥仓储", "跨境物流", "建行云贷"];

const heroContent = {
  nav: "云贷方案",
  name: "风控赋能云贷",
  badge: "Meiou × CCB Cloud Loan",
  title: "美鸥风控赋能云贷，专属融资护航跨境经营",
  subtitle: "深耕跨境电商与外贸企业融资场景，依托美鸥智能大数据风控体系，精准贴合资金周转、备货扩张、回款衔接等经营痛点，提供高效、低成本、高灵活的专属融资解决方案。",
  cta: "查看两大产品",
  altCta: "预约融资顾问",
};

const flowSteps = [
  ["01", "经营数据接入", "物流、仓储、店铺销售、回款等多维数据加固直连。"],
  ["02", "美鸥风控建模", "根据货值、账期、评级、报关额与经营稳定性形成授信画像。"],
  ["03", "建行线上审批", "授信申请、数据核验、审批放款全流程线上操作。"],
  ["04", "贷后闭环管理", "货权水位、平台回款、资金用途与还款节奏持续跟踪。"],
];

const proofBadges = ["智能风控赋能", "最高 2000 万", "综合费率低至 3%", "最长授信 1 年", "循环授信随用随取", "提前还款无违约金"];

const coreAdvantages = [
  {
    index: "01",
    title: "大额额度充足",
    metric: "最高 2000 万",
    body: "覆盖采购备货、店铺运营、海外推广、仓储物流等全场景资金需求，支撑企业突破资金瓶颈、扩大经营规模。",
  },
  {
    index: "02",
    title: "超低费率成本",
    metric: "低至 3%",
    body: "依托美鸥智能大数据风控系统精准把控风险，优化融资成本结构，降低企业资金使用成本。",
  },
  {
    index: "03",
    title: "期限灵活可控",
    metric: "最长 1 年",
    body: "适配跨境回款周期不固定、淡旺季差异大的经营特点，按订单回款与资金流转节奏规划用款周期。",
  },
  {
    index: "04",
    title: "循环授信可用",
    metric: "随用随贷",
    body: "一次授信、循环使用，授信有效期内无需重复提交资料或重复审核，高效满足频繁周转需求。",
  },
  {
    index: "05",
    title: "提前还款无违约金",
    metric: "自由还款",
    body: "支持企业根据回款与现金流情况随时提前还款，不为闲置额度或提前回款承担额外成本。",
  },
];

const policyHighlights = [
  {
    key: "rate",
    title: "费率低至 3%",
    metric: "3%",
    body: "浦发对公宁波地区低至 3%，广发对公低至 4%，相比传统贷款利率优势显著。",
    action: "点击申请",
  },
  {
    key: "term",
    title: "期限灵活",
    metric: "3-9月",
    body: "最短 3 个月，最长 9 个月（微众对公），可按业务周期灵活选择。",
    action: "查看周期",
  },
  {
    key: "cycle",
    title: "额度可循环",
    metric: "循环",
    body: "额度循环使用，随借随还，适配旺季备货和日常周转。",
    action: "了解额度",
  },
  {
    key: "prepay",
    title: "提前还款",
    metric: "0违约金",
    body: "支持根据回款节奏提前还款，无提前还款违约金，减少闲置资金成本。",
    action: "咨询方案",
  },
];

const bankTabs = ["广发银行 CGB", "WeBank 微众银行", "浦发银行 SPD BANK", "中国建设银行 CCB"];

const bankAccess = [
  ["企业", "注册时长 >= 0.5 年，无失信/限高，无当前逾期"],
  ["法人", "23-65 岁，近 24 个月无连续逾期 3 期，近半年逾期 <= 2 次"],
  ["店铺", ">= 2 个店铺（或单店近 12 月 GMV > 2,000 万），至少 1 店经营 > 1 年，近 12 月总销售额 > 200 万，AHR 评分 > 200 分"],
];

const applicationSteps = [
  ["01", "店铺授权", "通过 Amazon Seller Central 完成店铺授权"],
  ["02", "提交申请", "上传企业及董事资料，完成线上申请"],
  ["03", "银行审批", "银行对资料进行审核及授信审批"],
  ["04", "支用放款", "发起支用，资金直达大陆对公账户"],
];

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
      ["2000 万", "最高可贷额度"],
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
      ["低至 3%", "综合费率"],
      ["1 年", "最长授信周期"],
      ["循环", "额度随用随取"],
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

function useScrollReveal() {
  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll("[data-reveal]"));

    if (!revealNodes.length) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" },
    );

    revealNodes.forEach((node, index) => {
      node.style.setProperty("--reveal-delay", `${Math.min(index % 7, 5) * 70}ms`);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);
}

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
        <a href="#advantages">核心优势</a>
        <a href="#access">准入流程</a>
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
          <strong>2000 万</strong>
          <small>最高可贷</small>
        </button>
        <button className="signal-card" type="button">
          <span>综合费率</span>
          <strong>低至 3%</strong>
          <small>优化融资成本</small>
        </button>
        <button className="signal-card" type="button">
          <span>授信周期</span>
          <strong>最长 1 年</strong>
          <small>匹配回款节奏</small>
        </button>
        <button className="signal-card shield" type="button">
          <span>额度使用</span>
          <strong>循环授信</strong>
          <small>随用随贷</small>
        </button>
      </div>
      <div className="credit-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
        <b>3%</b>
        <span>智能风控压降成本</span>
      </div>
    </aside>
  );
}

function ProofRibbon() {
  return (
    <section className="proof-ribbon" aria-label="Cloud loan proof points" data-reveal>
      <div className="ribbon-track">
        {[...proofBadges, ...proofBadges].map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function PolicyShowcase() {
  return (
    <section id="advantages" className="policy-showcase" aria-label="Cloud loan policy highlights">
      <div className="policy-inner">
        <div className="section-heading dark-heading" data-reveal>
          <p className="eyebrow">loan highlights</p>
          <h2>把低成本、灵活周期和循环额度讲清楚</h2>
          <p className="section-copy">
            参考银行产品页的信息表达，把客户最关心的费率、期限、额度使用方式拆成逐屏出现的重点模块。
          </p>
        </div>

        <div className="policy-stack">
          {policyHighlights.map((item, index) => (
            <article key={item.key} className={index % 2 === 1 ? "policy-row reverse" : "policy-row"} data-reveal>
              <div className={`policy-visual ${item.key}`} aria-hidden="true">
                <div className="policy-orbit">
                  <span>{item.metric}</span>
                </div>
                <i />
                <i />
                <i />
              </div>
              <div className="policy-copy">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <a href="#contact">{item.action}</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductPanel() {
  const [active, setActive] = useState(products[0].name);
  const selected = useMemo(() => products.find((product) => product.name === active) ?? products[0], [active]);

  return (
    <section id="products" className="products cloud-products">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">product matrix</p>
        <h2>两类融资产品，覆盖跨境卖家核心资金场景</h2>
        <p className="section-copy">货押贷解决备货与库存占资，应收贷解决平台账期与轻资产授信。</p>
      </div>

      <div className="product-tabs" role="tablist" aria-label="Loan products" data-reveal>
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

      <div className="loan-detail" data-reveal>
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
      <div className="section-heading" data-reveal>
        <p className="eyebrow">three financing scenes</p>
        <h2>三张核心概念图，把云贷产品讲成清晰的独立模块</h2>
        <p className="section-copy">
          不再把信息挤在一块：货押贷、应收贷、数据风控分别独立展开，每个模块都对应一个真实经营场景。
        </p>
      </div>

      <div className="scene-stack">
        {financingScenes.map((scene, index) => (
          <article key={scene.id} className={index % 2 === 1 ? "scene-panel reverse" : "scene-panel"} data-reveal>
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

function AdvantageEngine() {
  return (
    <section id="engine" className="advantage-engine" aria-label="Cloud loan core advantages">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">core advantages</p>
        <h2>把融资能力做成一套可循环运转的资金引擎</h2>
        <p className="section-copy">
          美鸥风控把跨境经营数据转化为授信依据，让企业在备货、推广、物流、回款衔接中获得更低成本、更高灵活度的资金支持。
        </p>
      </div>
      <div className="advantage-grid">
        {coreAdvantages.map((item) => (
          <article key={item.index} className="advantage-card" data-reveal>
            <div className="advantage-topline">
              <span>{item.index}</span>
              <b>{item.metric}</b>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="capital-flow" aria-label="Data risk control flow" data-reveal>
        <div>
          <span>经营数据</span>
          <strong>店铺 / 物流 / 仓储 / 回款</strong>
        </div>
        <i />
        <div>
          <span>智能风控</span>
          <strong>授信画像与风险定价</strong>
        </div>
        <i />
        <div>
          <span>云贷额度</span>
          <strong>循环授信 / 随用随取</strong>
        </div>
      </div>
    </section>
  );
}

function AccessAndProcess() {
  return (
    <section id="access" className="access-process" aria-label="Bank access conditions and application process">
      <div className="access-inner">
        <div className="access-card" data-reveal>
          <div className="access-title">
            <p className="eyebrow">准入条件速查</p>
            <h2>银行准入信息前置展示，客户一眼判断匹配度</h2>
          </div>
          <div className="bank-tabs" aria-label="Cooperating banks">
            {bankTabs.map((bank) => (
              <button key={bank} className={bank.includes("WeBank") ? "active" : ""} type="button">
                {bank}
              </button>
            ))}
          </div>
          <div className="access-checks">
            <span className="access-pill">对公</span>
            {bankAccess.map(([label, text]) => (
              <div key={label} className="access-line">
                <b>{label}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="process-panel">
          <div className="process-heading" data-reveal>
            <p className="eyebrow">申请流程</p>
            <h2>4 步完成申请，最快一周资金到账</h2>
            <p className="section-copy">从店铺授权到资金直达账户，全程线上协同。</p>
          </div>
          <div className="process-grid">
            {applicationSteps.map(([number, title, body]) => (
              <article key={number} className="process-step" data-reveal>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
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
      <div className="lead-copy" data-reveal>
        <p className="eyebrow">financing intake</p>
        <h2>提交经营信息，获取平台云贷初步匹配方案</h2>
        <p className="section-copy">
          请按实际经营情况填写，融资顾问会根据企业规模、增长情况与意向金额进行初步匹配。
        </p>
      </div>

      <form className="lead-form" onSubmit={submitLead} data-reveal>
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

export function App() {
  useScrollReveal();

  return (
    <main className="site-shell template-command final-template">
      <div className="ambient-layer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Header />

      <section id="top" className="hero cloud-hero">
        <div className="hero-copy" data-reveal>
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
            <span>最高 2000 万</span>
            <span>综合费率低至 3%</span>
            <span>循环授信随用随取</span>
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

        <div data-reveal="zoom">
          <HeroVisual />
        </div>
      </section>

      <ProofRibbon />

      <PolicyShowcase />

      <AdvantageEngine />

      <AccessAndProcess />

      <section id="ecosystem" className="partner-rail cloud-rail" aria-label="Cloud loan ecosystem" data-reveal>
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
        <div data-reveal>
          <p className="eyebrow">why it works</p>
          <h2>从经营数据到银行授信，一套链路跑通低成本融资闭环</h2>
          <p className="section-copy">
            依托美鸥跨境物流、仓储与店铺经营数据，解决轻资产、缺传统抵押物、备货垫资和账期占用现金流的融资难题。
          </p>
        </div>
        <div className="flow-grid">
          {flowSteps.map(([step, title, body]) => (
            <article key={step} className="flow-card" data-reveal>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <ProductPanel />

      <LeadForm />
    </main>
  );
}
