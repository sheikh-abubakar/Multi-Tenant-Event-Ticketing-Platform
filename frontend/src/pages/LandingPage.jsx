import { Link } from "react-router-dom";
import "./LandingPage.css";

const categories = ["CONCERTS", "SPORTS", "THEATRE", "EXPOS", "COMEDY", "CONFERENCES"];

const LandingPage = () => (
  <div className="landing-page">
    <section className="landing-hero">
      <div className="spotlight spotlight-one" />
      <div className="spotlight spotlight-two" />
      <div className="hero-ticket ticket-one" aria-hidden="true"><span>ADMIT</span><strong>01</strong></div>
      <div className="hero-ticket ticket-two" aria-hidden="true"><span>LIVE</span><strong>SP</strong></div>
      <div className="landing-wrap hero-grid">
        <div className="hero-copy reveal">
          <p className="eyebrow">THE LIVE-EVENT OPERATING SYSTEM</p>
          <h1>MAKE THE<br /><em>CROWD</em> MOVE.</h1>
          <p className="hero-lede">StagePass brings the stage, the seat map, the sale and the scan into one unforgettable ticketing experience.</p>
          <div className="hero-actions">
            <Link to="/signup" className="landing-cta landing-cta--gold">Create your organization <span>→</span></Link>
            <Link to="/browse" className="landing-cta landing-cta--ghost">Browse events <span>↗</span></Link>
          </div>
        </div>
        <div className="hero-side reveal reveal-delay">
          <p className="hero-side-kicker">NEXT UP</p>
          <div className="hero-side-line" />
          <p>Tickets that feel<br />as alive as the event.</p>
        </div>
      </div>
      <div className="category-marquee" aria-label="Event categories">
        <div>{[...categories, ...categories].map((item, index) => <span key={`${item}-${index}`}>{item}<b>✦</b></span>)}</div>
      </div>
    </section>

    <section className="stats-strip" aria-label="StagePass placeholder statistics">
      <div className="landing-wrap stats-grid">
        <p><strong>10,000+</strong><span>Tickets sold<small>Placeholder</small></span></p>
        <p><strong>500+</strong><span>Organizers<small>Placeholder</small></span></p>
        <p><strong>50+</strong><span>Cities live<small>Placeholder</small></span></p>
        <p><strong>99.9%</strong><span>Scan-ready<small>Placeholder</small></span></p>
      </div>
    </section>

    <section className="landing-section landing-section--organizers">
      <div className="landing-wrap split-layout">
        <div className="section-copy reveal">
          <p className="eyebrow">FOR ORGANIZERS</p>
          <h2>RUN THE ROOM.<br /><em>NOT AROUND IT.</em></h2>
          <p>Build your venue once, price every section with confidence, then watch bookings, revenue and refunds update from a single organization workspace.</p>
          <Link to="/signup" className="text-link">Start selling with StagePass <span>→</span></Link>
        </div>
        <div className="dashboard-mockup reveal reveal-delay" aria-label="Illustrative organizer analytics dashboard">
          <div className="mockup-top"><span>STAGEPASS / ANALYTICS</span><i /></div>
          <div className="mockup-kpis"><b>$248K<small>REVENUE</small></b><b>1,840<small>SEATS SOLD</small></b></div>
          <div className="mockup-chart"><span style={{ height: "28%" }} /><span style={{ height: "48%" }} /><span style={{ height: "36%" }} /><span style={{ height: "72%" }} /><span style={{ height: "57%" }} /><span style={{ height: "92%" }} /><span style={{ height: "78%" }} /></div>
          <div className="mockup-footer"><span>LIVE BOOKINGS</span><strong>+18.4%</strong></div>
        </div>
      </div>
    </section>

    <section className="landing-section landing-section--buyers">
      <div className="landing-wrap split-layout split-layout--reverse">
        <div className="ticket-stack reveal" aria-label="Illustrative QR ticket">
          <div className="mini-ticket mini-ticket--back" />
          <div className="mini-ticket mini-ticket--front"><p>STAGEPASS</p><strong>THE NIGHT<br />IS YOURS</strong><div className="ticket-qr">▦</div><small>SCAN TO ENTER</small></div>
        </div>
        <div className="section-copy reveal reveal-delay">
          <p className="eyebrow">FOR BUYERS</p>
          <h2>FROM YOUR<br /><em>SEAT TO THE SET.</em></h2>
          <p>Choose the exact seat, check out securely, receive a QR ticket instantly and manage eligible refunds through your StagePass wallet.</p>
          <Link to="/browse" className="text-link">Find your next event <span>→</span></Link>
        </div>
      </div>
    </section>

    <section className="how-section">
      <div className="landing-wrap">
        <p className="eyebrow">ONE PLATFORM. THREE CUES.</p>
        <h2>FROM ANNOUNCEMENT<br />TO <em>APPLAUSE.</em></h2>
        <div className="how-timeline">
          <article className="reveal"><span>01</span><div><h3>Set the stage</h3><p>Create your organization, venue and event map on your terms.</p></div></article>
          <article className="reveal reveal-delay"><span>02</span><div><h3>Fill the house</h3><p>Publish tickets and let buyers choose exactly where they belong.</p></div></article>
          <article className="reveal reveal-delay-2"><span>03</span><div><h3>Scan them in</h3><p>Use secure QR confirmation to turn every sale into a seat in the crowd.</p></div></article>
        </div>
      </div>
    </section>

    <section className="final-cta">
      <div className="landing-wrap reveal">
        <p className="eyebrow">YOUR NEXT SHOW STARTS HERE</p>
        <h2>PUT YOUR EVENT<br />IN <em>THE SPOTLIGHT.</em></h2>
        <Link to="/signup" className="landing-cta landing-cta--gold">Create your organization <span>→</span></Link>
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-wrap footer-row"><span className="display">Stagepass</span><p>Built for the rush before the lights go down.</p><div><Link to="/login">Log in</Link><Link to="/signup">Sign up</Link></div></div>
    </footer>
  </div>
);

export default LandingPage;
