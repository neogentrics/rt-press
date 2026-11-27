// The toolbar's drawings, as paths on a 24 by 24 grid, drawn in the colour of the text round them.
const PATHS = {
  import: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13l3 3 3-3',
  build: 'M12 6C10 4.5 7 4 4 4.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14',
  save: 'M12 4v11M8 11l4 4 4-4M5 17v3h14v-3',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l5 5',
  preferences: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 16.6v.2',
  close: 'M6 6l12 12M18 6L6 18',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}
