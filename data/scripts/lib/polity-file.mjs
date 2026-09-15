// The on-disk shape of a polity file, in one place, because two scripts write
// them: import-cliopatria.mjs dumps them and curate-polities.mjs rewrites them.
// If they disagree about formatting, every curation run shows up as a diff
// against every file rather than against the ones it changed.

/**
 * A Cliopatria name -> a filename. Accents are folded rather than dropped, so
 * "Michoacán" and "Éire" become michoacan and eire instead of michoac-n.
 */
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The house format: a span's scalars on one line, its geometry compact on the
 * next, its prose on the last. Plain JSON.stringify with an indent puts every
 * coordinate on its own line, which turns a continent into megabytes of
 * whitespace and makes the files unreadable in a diff.
 */
export function serialisePolity(spec) {
  const head = [];
  head.push(`  "name": ${JSON.stringify(spec.name)}`);
  if (spec.adjective) head.push(`  "adjective": ${JSON.stringify(spec.adjective)}`);
  head.push(`  "color": ${JSON.stringify(spec.color)}`);
  if (spec.cliopatria) {
    // Provenance, and the material curation works from. The build ignores it;
    // it is here so a merge can be decided from what is in the repository.
    head.push(`  "cliopatria": ${JSON.stringify(spec.cliopatria)}`);
  }

  const spans = spec.features.map((span) => {
    const scalars = ['from', 'to', 'name', 'label', 'status', 'relationship', 'overlord']
      .filter((key) => span[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(span[key])}`)
      .join(', ');
    return (
      `    { ${scalars},\n` +
      `      "geometry": ${JSON.stringify(span.geometry)}` +
      (span.source ? `,\n      "source": ${JSON.stringify(span.source)}` : '') +
      ' }'
    );
  });

  return `{\n${head.join(',\n')},\n  "features": [\n${spans.join(',\n')}\n  ]\n}\n`;
}
