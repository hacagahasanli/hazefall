import Link from 'next/link';

const HomePage = () => (
  <main className="grid-bg flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
    <div className="text-sm font-semibold tracking-[0.3em] text-blue">
      <span className="text-green">&lt;&lt;&lt;&lt;</span> MERGE CONFLICT PRESENTS <span className="text-orange">&gt;&gt;&gt;&gt;</span>
    </div>
    <h1 className="font-display text-5xl leading-[1.05] sm:text-7xl">
      LAST COMMIT
      <br />
      <span className="text-gold">STANDING</span>
    </h1>
    <p className="max-w-md text-lg text-cream/80">
      Ten developers drop onto the campus. Find a gun, find cover, and stay ahead of the Deadline. The last commit standing
      ships.
    </p>
    <Link href="/play" className="panel-cut bg-gold px-8 py-3 font-bold uppercase tracking-wider text-ink-deep hover:brightness-110">
      Play
    </Link>
  </main>
);

export default HomePage;
