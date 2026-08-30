export default function MapUnavailable({ reason }: { reason: 'webgl' | 'init' }) {
  return (
    <div className="unavailable">
      <div className="unavailable-inner panel">
        <h1>The map can’t start</h1>
        {reason === 'webgl' ? (
          <>
            <p>
              This browser has no <strong>WebGL2</strong>, which the map needs to draw on the GPU.
            </p>
            <ol>
              <li>
                Open <code>chrome://settings/system</code> and turn on “Use graphics acceleration
                when available”, then restart the browser.
              </li>
              <li>
                Check <code>chrome://gpu</code> — “WebGL2” should read <em>Hardware accelerated</em>.
              </li>
              <li>Safari and Firefox support it too, if Chrome stays stuck.</li>
            </ol>
          </>
        ) : (
          <p>
            The graphics context failed to initialise. Reloading usually clears it; if not, the
            console has the underlying error.
          </p>
        )}
      </div>
    </div>
  );
}
