/**
 * CSV Data Exporters for Oscilloscope Waveform Captures & AC Bode Frequency Sweeps.
 */

/**
 * Export Oscilloscope waveform buffer to RFC 4180 CSV.
 * @param {{ count: number, times: Float64Array, channels: Record<number, Float64Array> }} history
 * @param {Array<{ channel: number, label: string }>} probes
 */
export function exportScopeCSV(history, probes) {
  const active = probes.length > 0
    ? probes.map((p) => ({ ch: p.channel, name: `${p.label || 'CH' + p.channel}_V` }))
    : [{ ch: 1, name: 'CH1_V' }];

  const header = ['time_s', ...active.map((a) => a.name.replace(/,/g, '_'))].join(',');
  const rows = [header];
  for (let i = 0; i < history.count; i++) {
    const cols = [history.times[i].toExponential(6)];
    for (const a of active) {
      cols.push(history.channels[a.ch][i].toFixed(6));
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n');
}

/**
 * Export AC Sweep (Bode Plot) data to CSV.
 * @param {object} acResult
 */
export function exportBodeCSV(acResult) {
  if (!acResult || !acResult.ok) return 'frequency_Hz\n';
  const headers = ['frequency_Hz'];
  for (const ch of acResult.channels) {
    const tag = (ch.label || `CH${ch.channel}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    headers.push(`${tag}_mag_dB`, `${tag}_phase_deg`);
  }
  const rows = [headers.join(',')];
  const n = acResult.frequencies.length;
  for (let i = 0; i < n; i++) {
    const cols = [acResult.frequencies[i].toExponential(6)];
    for (const ch of acResult.channels) {
      cols.push(ch.magDb[i].toFixed(4), ch.phaseDeg[i].toFixed(3));
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n');
}
