import { buildProductMatchView } from "../lib/productMatchView.js";

function CatalogProductCard({ product }) {
  return (
    <article className="product-catalog-card">
      <header>
        <span>{product.institution}</span>
        <h4>{product.name}</h4>
      </header>
      <dl className="product-catalog-metrics">
        <div>
          <dt>币种</dt>
          <dd>{product.currency}</dd>
        </div>
        <div>
          <dt>额度信息</dt>
          <dd>{product.limit}</dd>
        </div>
        <div>
          <dt>期限安排</dt>
          <dd>{product.term}</dd>
        </div>
      </dl>
      <div className="product-target-profile">
        <span>适配画像</span>
        <p>{product.targetProfile}</p>
      </div>
    </article>
  );
}

function ProductCatalog({ groups }) {
  return (
    <div className="product-scenario-list">
      {groups.map((group) => (
        <section className="product-scenario-group" key={group.id} aria-labelledby={`scenario-${group.id}`}>
          <header className="scenario-heading">
            <h3 id={`scenario-${group.id}`}>{group.label}</h3>
            <span>{group.products.length} 款产品</span>
          </header>
          <div className="scenario-product-grid">
            {group.products.map((product) => <CatalogProductCard key={product.id} product={product} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function PrimaryResult({ product }) {
  return (
    <article className="match-primary-result">
      <header className="primary-result-heading">
        <div>
          <span className="result-rank">{product.presentationLabel}</span>
          <p>{product.institution}</p>
          <h3>{product.name}</h3>
        </div>
        <div className="primary-result-amount">
          <strong>{product.amount}</strong>
          {product.amountNote && <small>{product.amountNote}</small>}
        </div>
      </header>

      <dl className="primary-result-metrics">
        <div>
          <dt>币种</dt>
          <dd>{product.currency || "待核定"}</dd>
        </div>
        <div>
          <dt>期限</dt>
          <dd>{product.term}</dd>
        </div>
        <div>
          <dt>参考定价</dt>
          <dd>{product.pricing}</dd>
        </div>
      </dl>

      <div className="primary-result-reasons">
        <section>
          <h4>为什么匹配</h4>
          {product.whyMatched.length > 0 ? (
            <ul>{product.whyMatched.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          ) : (
            <p>{product.presentationLabel === "优先匹配"
              ? "当前已提交信息支持优先评估该产品方向。"
              : "当前资料支持将该产品作为进一步核验方向。"}</p>
          )}
        </section>
        <section>
          <h4>核心前置条件</h4>
          <p>{product.keyPrerequisite || "待资金方进一步核验"}</p>
        </section>
      </div>
    </article>
  );
}

function AlternativeResult({ product }) {
  return (
    <article className="match-alternative-result">
      <header>
        <span>{product.presentationLabel}</span>
        <p>{product.institution}</p>
        <h4>{product.name}</h4>
      </header>
      <dl className="alternative-result-metrics">
        <div>
          <dt>参考额度</dt>
          <dd>
            {product.amount}
            {product.amountNote && <small className="amount-note">{product.amountNote}</small>}
          </dd>
        </div>
        <div><dt>期限</dt><dd>{product.term}</dd></div>
      </dl>
      <section>
        <h5>与首选的差异</h5>
        <ul>{product.differences.map((difference) => <li key={difference}>{difference}</li>)}</ul>
      </section>
      <section>
        <h5>本轮待补信息</h5>
        {product.missingInformation.length > 0 ? (
          <ul>{product.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : (
          <p>暂无额外资料提示。</p>
        )}
      </section>
    </article>
  );
}

function MatchResults({ view }) {
  return (
    <div className="product-match-results" aria-live="polite">
      {view.primary ? (
        <PrimaryResult product={view.primary} />
      ) : (
        <section className="match-empty-state">
          <h3>当前暂无优先推荐</h3>
          <p>{view.summary || "请补充相关经营信息后再评估。"}</p>
        </section>
      )}

      {view.alternatives.length > 0 && (
        <section className="match-alternatives" aria-labelledby="match-alternatives-title">
          <header>
            <p className="eyebrow">alternative options</p>
            <h3 id="match-alternatives-title">其他产品方向</h3>
          </header>
          <div className="match-alternative-grid">
            {view.alternatives.map((product) => (
              <AlternativeResult key={product.productId || product.name} product={product} />
            ))}
          </div>
        </section>
      )}

      {view.missingDocuments.length > 0 && (
        <section className="match-document-list" aria-labelledby="match-documents-title">
          <div>
            <span>{String(view.missingDocuments.length).padStart(2, "0")}</span>
            <h3 id="match-documents-title">建议补充资料</h3>
          </div>
          <ul>{view.missingDocuments.map((document) => <li key={document}>{document}</li>)}</ul>
        </section>
      )}

      {view.nonMatches.length > 0 && (
        <details className="match-nonmatches">
          <summary>查看暂不匹配的产品（{view.nonMatches.length}）</summary>
          <div>
            {view.nonMatches.map((product) => (
              <section key={`${product.institution}-${product.name}`}>
                <h4>{product.name}</h4>
                <p>{product.institution} · {product.reason}</p>
              </section>
            ))}
          </div>
        </details>
      )}

      <p className="product-match-disclaimer">{view.disclaimer}</p>
    </div>
  );
}

export function ProductMatchCenter({ report, products }) {
  const view = buildProductMatchView(report, products);
  const catalogIsLoading = view.state === "catalog" && products == null;
  const catalogIsUnavailable = view.state === "catalog" && !catalogIsLoading && view.groups.length === 0;

  return (
    <section id="product-match-center" className="product-match-center" aria-labelledby="product-match-title" tabIndex="-1" data-reveal>
      <header className="product-match-heading">
        <div>
          <p className="eyebrow">AI product matching</p>
          <h2 id="product-match-title">AI 产品智能匹配中心</h2>
        </div>
        <p>
          {view.state === "catalog"
            ? "覆盖经营周转、外贸、Amazon 与 B2B 应收场景的融资产品目录。"
            : view.summary}
        </p>
      </header>

      {catalogIsLoading && <p className="product-catalog-status" role="status">正在加载产品目录…</p>}
      {catalogIsUnavailable && <p className="product-catalog-status" role="status">产品目录暂时无法加载，请稍后刷新。</p>}
      {view.state === "catalog" && !catalogIsLoading && !catalogIsUnavailable && <ProductCatalog groups={view.groups} />}
      {view.state === "report" && <MatchResults view={view} />}
    </section>
  );
}
