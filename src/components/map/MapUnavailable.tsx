export default function MapUnavailable({ reason }: { reason: 'webgl' | 'init' }) {
  return (
    <div className="fixed inset-0 grid place-items-center overflow-auto p-6">
      <div className="max-w-2xl rounded-xl border border-white/9 bg-panel/82 px-8 py-7 shadow-panel backdrop-blur-[18px] backdrop-saturate-[140%]">
        <h1 className="mb-3.5 font-serif text-[1.6rem] font-medium">The map can’t start</h1>
        {reason === 'webgl' ? (
          <>
            <p className="mb-3.5 text-[0.92rem] leading-relaxed text-ink-dim">
              This browser has no <strong>WebGL2</strong>, which the map needs to draw on the GPU.
            </p>
            <ol className="mb-2 list-decimal pl-[1.15rem] text-[0.9rem] text-ink-dim">
              <li className="mb-2.5 leading-relaxed">
                Open <code>chrome://settings/system</code> and turn on “Use graphics acceleration
                when available”, then restart the browser.
              </li>
              <li className="mb-2.5 leading-relaxed">
                Check <code>chrome://gpu</code> — “WebGL2” should read <em>Hardware accelerated</em>.
              </li>
              <li className="mb-2.5 leading-relaxed">Safari and Firefox support it too, if Chrome stays stuck.</li>
            </ol>
          </>
        ) : (
          <p className="mb-3.5 text-[0.92rem] leading-relaxed text-ink-dim">
            The graphics context failed to initialise. Reloading usually clears it; if not, the
            console has the underlying error.
          </p>
        )}
      </div>
    </div>
  );
}
