export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-16">
        <section className="space-y-4">
          <p className="text-sm uppercase tracking-[0.25em] text-zinc-400">
            The Vault v0.1
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Knox to Ellis Vertical Slice
          </h1>
          <p className="max-w-2xl text-zinc-300">
            This instance runs the first production path: invite queued, Knox
            sends the first SMS, inbound message is routed, and interest hands
            off to Ellis onboarding.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-medium">Endpoints</h2>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>
              <code className="rounded bg-zinc-800 px-2 py-1">POST /api/invites</code>{" "}
              queue an invite and trigger Knox.
            </li>
            <li>
              <code className="rounded bg-zinc-800 px-2 py-1">
                POST /api/sms/inbound
              </code>{" "}
              receive inbound SMS from Twilio or JSON payloads.
            </li>
            <li>
              <code className="rounded bg-zinc-800 px-2 py-1">GET /api/inngest</code>{" "}
              Inngest function serve endpoint.
            </li>
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-medium">Current Rules Enforced</h2>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>Knox sends one outbound invite message per queued invite.</li>
            <li>No unsolicited follow-up if invite is ignored.</li>
            <li>Declines are set to do-not-contact immediately.</li>
            <li>Interested replies hand off to Ellis with an opening message.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
