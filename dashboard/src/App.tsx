import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, signInWithGoogle, signOut } from "./auth/supabase";
import { fetchStatistics, fetchHistory, type BackendStatistics, type BackendSubmission } from "./lib/backendClient";
import { formatDuration } from "./lib/stats";
import StatCard from "./components/StatCard";
import TopicMastery from "./components/TopicMastery";
import WeakTopics from "./components/WeakTopics";
import RecentSubmissions from "./components/RecentSubmissions";
import "./styles.css";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [stats, setStats] = useState<BackendStatistics | null>(null);
  const [submissions, setSubmissions] = useState<BackendSubmission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track the Supabase session (handles the OAuth redirect completing too).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchStatistics(session.access_token), fetchHistory(session.access_token)])
      .then(([statsResult, historyResult]) => {
        setStats(statsResult);
        setSubmissions(historyResult);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [session]);

  if (sessionLoading) {
    return <div className="login-screen dashboard-hint">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="login-screen">
        <h1>⏱ CodePulse Dashboard</h1>
        <p className="dashboard-hint">Sign in with the same Google account you use in the extension.</p>
        <button onClick={signInWithGoogle}>Continue with Google</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>⏱ CodePulse Dashboard</h1>
        <div className="header-right">
          <span>Signed in as {session.user.email}</span>
          <button className="link-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {loading && <p className="dashboard-hint">Loading your solve history…</p>}
      {loadError && <p className="error-text">{loadError}</p>}

      {stats && submissions && (
        <>
          <section className="stats-grid">
            <StatCard label="Problems Solved" value={String(stats.total_solved)} />
            <StatCard label="Average Solve Time" value={formatDuration(stats.average_solve_seconds)} />
            <StatCard label="Current Streak" value={`${stats.current_streak}d`} />
            <StatCard label="Acceptance Rate" value={`${stats.acceptance_rate}%`} />
          </section>

          <section className="panel">
            <h2>Difficulty Breakdown</h2>
            <div className="difficulty-breakdown">
              {stats.by_difficulty.map((d) => (
                <div key={d.difficulty} className={`difficulty-card difficulty-${d.difficulty.toLowerCase()}`}>
                  <div className="difficulty-count">{d.count}</div>
                  <div>{d.difficulty}</div>
                  <div className="difficulty-avg">avg {formatDuration(d.avg_seconds)}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="two-column">
            <section className="panel">
              <h2>Topic Mastery</h2>
              <TopicMastery topics={stats.by_topic} />
            </section>
            <section className="panel">
              <h2>Needs Practice</h2>
              <WeakTopics topics={stats.by_topic} />
            </section>
          </div>

          <section className="panel">
            <h2>Submissions</h2>
            <RecentSubmissions submissions={submissions} />
          </section>
        </>
      )}
    </div>
  );
}
