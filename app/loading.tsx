const card = "rounded-2xl border border-white/10 bg-[#0F121C]/85 animate-pulse motion-reduce:animate-none";

/** Skeleton shown while a route segment loads: same frame as the cockpit cards. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex max-w-2xl flex-col gap-3">
        <div className="h-3 w-20 rounded bg-[#00F0FF]/20" />
        <div className="h-8 w-72 max-w-full rounded bg-white/10" />
        <div className="h-4 w-full rounded bg-white/5" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
        <div className={`${card} h-[28rem]`} />
        <div className="flex min-w-0 flex-col gap-6">
          <div className={`${card} h-40`} />
          <div className={`${card} h-28`} />
          <div className={`${card} h-72`} />
        </div>
      </div>
    </main>
  );
}
