import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { useState, useRef, useEffect } from "react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "OrderEase - Self-Serve Order Editing for Shopify" },
    {
      name: "description",
      content:
        "OrderEase lets shoppers update shipping addresses, sizes, colors and items on unfulfilled orders right after checkout, with no support ticket needed.",
    },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const [shopDomain, setShopDomain] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [savedDemo, setSavedDemo] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(872); // 14:32 in seconds
  const [activeModal, setActiveModal] = useState<"privacy" | "support" | null>(null);

  const heroInputRef = useRef<HTMLInputElement>(null);

  // Live countdown timer for hero demo card
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 900));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleDemoSave = () => {
    setSavedDemo(true);
    setTimeout(() => setSavedDemo(false), 2200);
  };

  const scrollToInstall = (e: React.MouseEvent) => {
    e.preventDefault();
    heroInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      heroInputRef.current?.focus();
    }, 400);
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const input = form.elements.namedItem("shop") as HTMLInputElement;
    if (input && input.value) {
      let val = input.value.trim().toLowerCase();
      val = val.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!val.includes(".") && val.length > 0) {
        val = `${val}.myshopify.com`;
      }
      input.value = val;
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleSupportClick = () => {
    if (typeof window !== "undefined" && (window as any).Tawk_API?.maximize) {
      (window as any).Tawk_API.maximize();
    } else {
      setActiveModal("support");
    }
  };

  const faqs = [
    {
      q: "Which orders can customers edit?",
      a: "Unfulfilled orders, within the time window and edit limits you configure.",
    },
    {
      q: "Does it update my Shopify admin?",
      a: "Yes. Edits are validated first, then applied to the order in Shopify admin instantly.",
    },
    {
      q: "Where do customers find the editor?",
      a: "On the checkout thank-you page and in the order details of their customer account.",
    },
    {
      q: "Can I turn features on or off?",
      a: "Yes. Manage which of the 11 services are active from inside the app.",
    },
  ];

  return (
    <div className={styles.pageWrapper}>
      {/* ─── Header Navigation ─── */}
      <header className={styles.header}>
        <div className={styles.container}>
          <nav className={styles.nav}>
            <a href="/" className={styles.logo}>
              <span className={styles.logoIcon}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className={styles.logoText}>OrderEase</span>
            </a>

            <ul className={styles.navLinks}>
              <li>
                <a href="#features" className={styles.navLink}>
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className={styles.navLink}>
                  How it works
                </a>
              </li>
              <li>
                <a href="#controls" className={styles.navLink}>
                  Controls
                </a>
              </li>
              <li>
                <a href="#faq" className={styles.navLink}>
                  FAQ
                </a>
              </li>
            </ul>

            <div className={styles.navActions}>
              <button
                type="button"
                onClick={scrollToInstall}
                className={styles.installButtonPill}
              >
                Install app
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className={styles.heroSection}>
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            {/* Left Content */}
            <div className={styles.heroContent}>
              <div className={styles.heroBadge}>
                Order editing for Shopify
              </div>
              <h1 className={styles.heroHeading}>
                Let customers fix
                <br />
                their own orders.
              </h1>
              <p className={styles.heroDescription}>
                OrderEase lets shoppers update shipping addresses, sizes,
                colors and items on unfulfilled orders right after checkout,
                with no support ticket needed.
              </p>

              {showForm && (
                <div id="hero-install-form" className={styles.domainForm}>
                  <label htmlFor="hero-shop-input" className={styles.formLabel}>
                    Your Shopify store domain
                  </label>
                  <Form
                    method="post"
                    action="/auth/login"
                    onSubmit={handleFormSubmit}
                  >
                    <div className={styles.inputRow}>
                      <input
                        ref={heroInputRef}
                        id="hero-shop-input"
                        className={styles.domainInput}
                        type="text"
                        name="shop"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        placeholder="my-shop-domain.myshopify.com"
                        required
                      />
                      <button
                        className={styles.primaryButton}
                        type="submit"
                      >
                        Install OrderEase
                      </button>
                    </div>
                  </Form>
                  <span className={styles.formHelper}>
                    e.g. my-shop-domain.myshopify.com
                  </span>
                </div>
              )}
            </div>

            {/* Right Interactive Mockup Card */}
            <div className={styles.heroCardWrapper}>
              <div className={styles.orderCard}>
                <div className={styles.orderCardHeader}>
                  <span className={styles.orderNumber}>Order #1001</span>
                  <span className={styles.timerBadge}>
                    <span className={styles.timerPulse}></span>
                    Edit window: {formatTime(secondsLeft)} left
                  </span>
                </div>

                {/* Item Row */}
                <div className={styles.orderItemRow}>
                  <div className={styles.itemThumb}>
                    {/* Clothing icon */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
                    </svg>
                  </div>
                  <div className={styles.itemDetails}>
                    <div className={styles.itemTitle}>Classic Tee</div>
                    <div className={styles.itemVariant}>
                      <span className={styles.variantFrom}>Size M</span>
                      <span className={styles.variantArrow}>→</span>
                      <span className={styles.variantTo}>Size L</span>
                    </div>
                  </div>
                  <div className={styles.itemQty}>Qty 1</div>
                </div>

                {/* Shipping Address Box */}
                <div className={styles.shippingBox}>
                  <div className={styles.shippingLabel}>SHIPPING ADDRESS</div>
                  <div className={styles.shippingText}>
                    12 Example Street, Apt 4B
                  </div>
                  <div className={styles.shippingTextSub}>
                    Springfield, 00000
                  </div>
                </div>

                {/* Save Changes CTA Button */}
                <button
                  type="button"
                  onClick={handleDemoSave}
                  className={`${styles.saveChangesBtn} ${
                    savedDemo ? styles.saveFeedback : ""
                  }`}
                >
                  {savedDemo ? (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Saved successfully!
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>

                <div className={styles.syncNote}>
                  <span className={styles.syncDot}></span>
                  Synced to Shopify admin instantly
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── "Right where customers already are" Section ─── */}
      <section className={styles.whereSection}>
        <div className={styles.container}>
          <div className={styles.whereContainer}>
            <h2 className={styles.whereHeading}>
              Right where customers
              <br />
              already are
            </h2>

            <div className={styles.whereBlock}>
              <h3 className={styles.whereBlockTitle}>
                Checkout thank-you page
              </h3>
              <p className={styles.whereBlockText}>
                Appears right after purchase, perfect for the wrong size or a
                mistyped address caught seconds later.
              </p>
            </div>

            <div className={styles.whereBlock}>
              <h3 className={styles.whereBlockTitle}>Customer account</h3>
              <p className={styles.whereBlockText}>
                An order status block on past and active orders gives shoppers
                control over anything still pending.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className={styles.featuresSection}>
        <div className={styles.container}>
          <div className={styles.sectionEyebrow}>FEATURES</div>
          <h2 className={styles.sectionHeading}>
            Every common order fix, self-serve
          </h2>
          <p className={styles.sectionSubhead}>
            Fewer support tickets, fewer wrong shipments, happier customers.
          </p>

          <div className={styles.featuresGrid}>
            {/* 01 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>01</span>
              <h3 className={styles.featureTitle}>Update shipping address</h3>
              <p className={styles.featureText}>
                Typed it wrong? Customers correct the address themselves before
                the order ships.
              </p>
            </div>

            {/* 02 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>02</span>
              <h3 className={styles.featureTitle}>Swap size or color</h3>
              <p className={styles.featureText}>
                Variant changes on unfulfilled orders, with no ticket and no back
                and forth.
              </p>
            </div>

            {/* 03 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>03</span>
              <h3 className={styles.featureTitle}>Change quantity</h3>
              <p className={styles.featureText}>
                Add or remove units. Inventory is checked before any change goes
                through.
              </p>
            </div>

            {/* 04 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>04</span>
              <h3 className={styles.featureTitle}>Add forgotten items</h3>
              <p className={styles.featureText}>
                Shoppers add what they missed straight after purchase, so you
                keep the extra sale.
              </p>
            </div>

            {/* 05 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>05</span>
              <h3 className={styles.featureTitle}>
                Apply missed discount codes
              </h3>
              <p className={styles.featureText}>
                Forgot a code at checkout? Customers can apply it right after they
                order.
              </p>
            </div>

            {/* 06 */}
            <div className={styles.featureCard}>
              <span className={styles.featureNumber}>06</span>
              <h3 className={styles.featureTitle}>
                Order notes and PDF invoice
              </h3>
              <p className={styles.featureText}>
                Edit the order note and download an invoice from the same screen.
              </p>
            </div>
          </div>

          <p className={styles.featuresNote}>
            OrderEase includes 11 services in total. Turn on only the ones you
            want.
          </p>
        </div>
      </section>

      {/* ─── How It Works Section ─── */}
      <section id="how-it-works" className={styles.howSection}>
        <div className={styles.container}>
          <div className={styles.sectionEyebrow}>HOW IT WORKS</div>
          <h2 className={styles.sectionHeading}>
            From order to corrected order
            <br />
            in four steps
          </h2>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <span className={styles.stepTag}>Step 1</span>
              <h3 className={styles.stepTitle}>Customer orders</h3>
              <p className={styles.stepText}>
                They check out on your store and the edit countdown starts
                immediately.
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepTag}>Step 2</span>
              <h3 className={styles.stepTitle}>They open their order</h3>
              <p className={styles.stepText}>
                From the thank-you page or the order details in their account.
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepTag}>Step 3</span>
              <h3 className={styles.stepTitle}>They make the edit</h3>
              <p className={styles.stepText}>
                Quantity, variant, address, note or invoice, whatever you have
                enabled.
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepTag}>Step 4</span>
              <h3 className={styles.stepTitle}>Shopify updates</h3>
              <p className={styles.stepText}>
                The edit is validated against your rules, then your Shopify
                admin updates instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Controls Section ─── */}
      <section id="controls" className={styles.controlsSection}>
        <div className={styles.container}>
          <div className={styles.controlsCard}>
            <div className={styles.controlsLeft}>
              <div className={styles.controlsEyebrow}>CONTROLS</div>
              <h2 className={styles.controlsHeading}>
                You set the rules.
                <br />
                Customers work inside
                <br />
                them.
              </h2>
              <p className={styles.controlsSubhead}>
                No surprise changes to orders that are ready to ship.
              </p>
            </div>

            <div className={styles.controlsRight}>
              <div className={styles.controlItem}>
                <h3 className={styles.controlItemTitle}>Time window limits</h3>
                <p className={styles.controlItemText}>
                  Choose how long after checkout an order can be edited.
                </p>
              </div>

              <div className={styles.controlItem}>
                <h3 className={styles.controlItemTitle}>Edit count limits</h3>
                <p className={styles.controlItemText}>
                  Cap how many times a single order can be changed.
                </p>
              </div>

              <div className={styles.controlItem}>
                <h3 className={styles.controlItemTitle}>Inventory checks</h3>
                <p className={styles.controlItemText}>
                  Edits are validated against stock levels before anything changes.
                </p>
              </div>

              <div className={styles.controlItem}>
                <h3 className={styles.controlItemTitle}>Live Shopify sync</h3>
                <p className={styles.controlItemText}>
                  Approved edits show up in Shopify admin right away.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section id="faq" className={styles.faqSection}>
        <div className={styles.container}>
          <div className={styles.faqHeader}>
            <h2 className={styles.sectionHeading}>Questions merchants ask</h2>
          </div>

          <div className={styles.faqContainer}>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className={styles.faqItem}>
                  <button
                    type="button"
                    className={styles.faqQuestionBtn}
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.faqQuestionLeft}>
                      <span
                        className={`${styles.faqArrow} ${
                          isOpen ? styles.faqArrowOpen : ""
                        }`}
                      >
                        ▶
                      </span>
                      {faq.q}
                    </span>
                  </button>
                  {isOpen && <p className={styles.faqAnswer}>{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA Section ─── */}
      <section className={styles.bottomCtaSection}>
        <div className={styles.container}>
          <div className={styles.bottomCtaCard}>
            <h2 className={styles.bottomCtaHeading}>
              Stop fixing orders by email
            </h2>
            <p className={styles.bottomCtaSubhead}>
              Enter your store domain to add OrderEase to Shopify.
            </p>

            {showForm && (
              <div className={styles.bottomCtaForm}>
                <Form
                  method="post"
                  action="/auth/login"
                  onSubmit={handleFormSubmit}
                  className={styles.bottomCtaFormGroup}
                >
                  <label
                    htmlFor="bottom-shop-input"
                    className={styles.bottomCtaLabel}
                  >
                    Your Shopify store domain
                  </label>
                  <div className={styles.bottomCtaInputRow}>
                    <input
                      id="bottom-shop-input"
                      className={styles.bottomCtaInput}
                      type="text"
                      name="shop"
                      value={shopDomain}
                      onChange={(e) => setShopDomain(e.target.value)}
                      placeholder="my-shop-domain.myshopify.com"
                      required
                    />
                    <button
                      className={styles.bottomCtaButton}
                      type="submit"
                    >
                      Install OrderEase
                    </button>
                  </div>
                </Form>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerContent}>
            <div className={styles.footerLeft}>
              © OrderEase
            </div>
            <div className={styles.footerRight}>
              <button
                type="button"
                className={styles.footerLink}
                onClick={() => setActiveModal("privacy")}
              >
                Privacy policy
              </button>
              <button
                type="button"
                className={styles.footerLink}
                onClick={handleSupportClick}
              >
                Support
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── Modals ─── */}
      {activeModal === "privacy" && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setActiveModal(null)}
        >
          <div
            className={styles.modalBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>
              Privacy Policy
            </h2>
            <div style={{ color: "#4b5563", fontSize: "14px", lineHeight: "1.6" }}>
              <p style={{ marginBottom: "12px" }}>
                OrderEase is committed to protecting the privacy of merchants and their customers.
                This Privacy Policy describes how personal information is collected, used, and shared
                when you install or use the app in connection with your Shopify-supported store.
              </p>
              <h4 style={{ fontWeight: 600, color: "#111827", margin: "16px 0 6px" }}>
                Information We Collect
              </h4>
              <p style={{ marginBottom: "12px" }}>
                When you install OrderEase, we automatically receive access to certain order information
                via Shopify APIs (such as order ID, shipping address, line items, and fulfillment status)
                strictly necessary to facilitate self-serve customer order adjustments.
              </p>
              <h4 style={{ fontWeight: 600, color: "#111827", margin: "16px 0 6px" }}>
                How We Use Your Information
              </h4>
              <p style={{ marginBottom: "12px" }}>
                We use the information solely to perform customer-requested order edits, validate changes
                against merchant-configured rules, and update Shopify admin records accordingly. We never
                sell customer personal data to third parties.
              </p>
              <h4 style={{ fontWeight: 600, color: "#111827", margin: "16px 0 6px" }}>
                Contact Us
              </h4>
              <p>
                If you have questions about our privacy practices, please contact us at support@orderease.io.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeModal === "support" && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setActiveModal(null)}
        >
          <div
            className={styles.modalBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>
              OrderEase Support
            </h2>
            <div style={{ color: "#4b5563", fontSize: "14px", lineHeight: "1.6" }}>
              <p style={{ marginBottom: "16px" }}>
                Need help setting up OrderEase or configuring your self-serve editing rules?
                Our team is here to assist you!
              </p>
              <div
                style={{
                  background: "#f3f4f6",
                  padding: "16px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 600, color: "#111827", marginBottom: "4px" }}>
                  Email Support
                </div>
                <div>support@orderease.io</div>
                <div style={{ fontSize: "12.5px", color: "#6b7280", marginTop: "4px" }}>
                  Response time: Usually within a few hours
                </div>
              </div>
              <p style={{ fontSize: "13px", color: "#6b7280" }}>
                You can also use the live chat widget at the bottom right corner of the page to speak with a specialist immediately.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
