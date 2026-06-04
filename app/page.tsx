import styles from "./page.module.css";

const features = [
  {
    title: "Smart conversations",
    body: "Answer buyer and seller questions instantly, around the clock.",
  },
  {
    title: "Listing insights",
    body: "Surface the right property details and comps in seconds.",
  },
  {
    title: "Always on your side",
    body: "A tireless assistant built to make every agent look great.",
  },
];

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <span className={styles.badge}>Host Portal · AI Assistant</span>
        <h1 className={styles.title}>
          Welcome to <span className={styles.brand}>Dougbro55</span>
        </h1>
        <p className={styles.subtitle}>
          The intelligent assistant built for real estate agents. Manage
          clients, answer questions, and close deals faster — all from one
          friendly portal.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#get-started">
            Get Started
          </a>
          <a className={styles.secondary} href="#learn-more">
            Learn More
          </a>
        </div>
      </section>

      <section id="learn-more" className={styles.features}>
        {features.map((f) => (
          <div key={f.title} className={styles.card}>
            <h3 className={styles.cardTitle}>{f.title}</h3>
            <p className={styles.cardBody}>{f.body}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Dougbro55</span>
        <span>Built for real estate professionals</span>
      </footer>
    </main>
  );
}
