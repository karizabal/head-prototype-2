import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

/*───────────────────────────────────────────────────────────────────────────────
  GLOBAL VARIABLES
───────────────────────────────────────────────────────────────────────────────*/
let projection, path, spherePath, graticulePath, eyes;
let axesPoints = [];
let currentView = 'front';
let filteredData = [];
let headTimer = null;

/*───────────────────────────────────────────────────────────────────────────────
  LOAD DATA
───────────────────────────────────────────────────────────────────────────────*/
function loadData(filename) {
  return d3.csv(`./data/${filename}.csv`)
    .then(raw => raw.map(d => ({
      group:  d.group,
      marker: d.marker,
      block:  d.block,
      genre:  d.genre,
      time_s: +d.time_s,
      x_mm:   +d.x_mm,
      y_mm:   +d.y_mm,
      z_mm:   +d.z_mm
    })))
    .catch(err => {
      console.error('Error loading CSV:', err);
      return [];
    });
}

/*───────────────────────────────────────────────────────────────────────────────
  RENDER HEAD SPHERE
───────────────────────────────────────────────────────────────────────────────*/
function renderHead(containerSelector) {
  // Clear any old SVG
  d3.select(containerSelector).selectAll('svg').remove();

  const svg = d3.select(containerSelector)
    .append('svg')
      .attr('viewBox', '0 0 600 600')
      .style('width', '100%')
      .style('height', 'auto');

  // Set rotation based on currentView
  let rotation;
  if (currentView === 'top') {
    rotation = [0, -90, 0];
  } else if (currentView === 'side') {
    rotation = [90, 0, 0];
  } else {
    rotation = [0, 0, 0];
  }

  // Create new projection and path (store in globals)
  projection = d3.geoOrthographic()
    .scale(100)
    .translate([300, 300])
    .rotate(rotation)
    .clipAngle(90);

  path = d3.geoPath(projection);

  // Define gradient
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient')
    .attr('id', 'shade')
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 200)
    .attr('y1', 0)
    .attr('x2', 200)
    .attr('y2', 400);

  grad.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#FFF9C4');
  grad.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', '#FDD835');

  // Draw sphere, graticule, eyes
  const g = svg.append('g');

  spherePath = g.append('path')
    .datum({ type: 'Sphere' })
    .attr('d', path)
    .attr('fill', 'url(#shade)')
    .attr('stroke', '#666')
    .attr('stroke-width', 1);

  graticulePath = g.append('path')
    .datum(d3.geoGraticule()())
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#666')
    .attr('stroke-width', 0.5);

  eyes = g.selectAll('circle.eye')
    .data([[-25, 10], [25, 10]])
    .join('circle')
      .attr('class', 'eye')
      .attr('r', 10)
      .attr('fill', '#333')
      .attr('cx', d => projection(d)[0])
      .attr('cy', d => projection(d)[1]);
}

/*───────────────────────────────────────────────────────────────────────────────
  RENDER AXES PLOT (XY, YZ, XZ)
───────────────────────────────────────────────────────────────────────────────*/
function renderAxesPlot(containerId, data, xKey, yKey) {
  d3.select(`#${containerId}`).selectAll('svg').remove();

  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width  = 300 - margin.left - margin.right;
  const height = 300 - margin.top  - margin.bottom;

  const svg = d3.select(`#${containerId}`)
    .append('svg')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .style('width', '100%')
      .style('height', 'auto')
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

  const xExtent = d3.extent(data, d => d[xKey]);
  const yExtent = d3.extent(data, d => d[yKey]);

  const xScale = d3.scaleLinear()
    .domain([xExtent[0] - 10, xExtent[1] + 10])
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([yExtent[0] - 10, yExtent[1] + 10])
    .range([height, 0]);

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale));

  svg.append('g')
    .call(d3.axisLeft(yScale));

  const pts = svg.selectAll('circle.point')
    .data(data)
    .enter().append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d[xKey]))
      .attr('cy', d => yScale(d[yKey]))
      .attr('r', 0)
      .attr('fill', 'steelblue')
      .style('opacity', 0);

  axesPoints.push(pts);

  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .text(`${xKey}`);

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .text(`${yKey}`);
}

/*───────────────────────────────────────────────────────────────────────────────
  VIEW-TOGGLE LOGIC
───────────────────────────────────────────────────────────────────────────────*/
function renderMiniHead(containerSelector, view) {
  // Clear any existing svg
  d3.select(containerSelector).selectAll('svg').remove();

  // Create a small 100×100 viewBox
  const svg = d3.select(containerSelector)
    .append('svg')
      .attr('viewBox', '0 0 100 100')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '50px')
      .style('height', '50px')
      .style('cursor', 'pointer');

  // Determine rotation based on view
  let rotation;
  if (view === 'top') {
    rotation = [0, -90, 0];
  } else if (view === 'side') {
    rotation = [90, 0, 0];
  } else {
    rotation = [0, 0, 0];
  }

  // Use a smaller projection for the mini head
  const miniProj = d3.geoOrthographic()
    .scale(30)
    .translate([50, 50])
    .rotate(rotation)
    .clipAngle(90);

  const miniPath = d3.geoPath(miniProj);

  // Define a simple gradient
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient')
    .attr('id', `shade-mini-${view}`)
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 50)
    .attr('y1', 0)
    .attr('x2', 50)
    .attr('y2', 100);

  grad.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#FFF9C4');
  grad.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', '#FDD835');

  const g = svg.append('g');

  // Draw sphere outline
  g.append('circle')
    .attr('cx', 50)
    .attr('cy', 50)
    .attr('r',  thirty => thirty)
    .attr('fill', `url(#shade-mini-${view})`)
    .attr('stroke', '#666')
    .attr('stroke-width', 1);

  // Draw graticule
  g.append('path')
    .datum(d3.geoGraticule()())
    .attr('d', miniPath)
    .attr('fill', 'none')
    .attr('stroke', '#aaa')
    .attr('stroke-width', 0.5);

  // Draw two static eyes
  g.selectAll('circle.eye-mini')
    .data([[-25, 5], [25, 5]])
    .join('circle')
      .attr('class', 'eye-mini')
      .attr('r', 4)
      .attr('fill', '#333')
      .attr('cx', d => miniProj(d)[0])
      .attr('cy', d => miniProj(d)[1]);
}

/*───────────────────────────────────────────────────────────────────────────────
  VIEW-TOGGLE LOGIC (legend of mini heads instead of dropdown)
───────────────────────────────────────────────────────────────────────────────*/
function initializeViewToggle() {
  const container = d3.select('#view-toggle');
  container.html(''); // clear any existing content

  // Create a wrapper for legend items
  const legend = container.append('div')
    .attr('id', 'view-legend')
    .style('display', 'flex')
    .style('gap', '0.5rem')
    .style('justify-content', 'center');

  // For each view, create a legend-item div
  ['front', 'top', 'side'].forEach(view => {
    const item = legend.append('div')
      .attr('class', 'legend-item')
      .attr('data-view', view)
      .style('display', 'flex')
      .style('flex-direction', 'column')
      .style('align-items', 'center')
      .style('cursor', 'pointer')
      .on('click', function() {
        currentView = view;
        // Highlight the active mini head
        d3.selectAll('.legend-item').classed('active', d => d3.select(this).attr('data-view') === d);
        updateView();
      });

    // Render the mini head icon inside this legend item
    renderMiniHead(item.node(), view);

    // Add a text label below the mini head
    item.append('span')
      .text(view[0].toUpperCase() + view.slice(1))
      .style('font-size', '10px')
      .style('margin-top', '2px');
  });

  // Mark “Front” as active initially
  d3.select('.legend-item[data-view="front"]').classed('active', true);
}

/*───────────────────────────────────────────────────────────────────────────────
  HEAD + AXES SYNCED ANIMATION
───────────────────────────────────────────────────────────────────────────────*/
function animateHeadTrajectory(headData) {
  const f = 4.5;
  const baseTranslate = [200, 200];

  // Stop any previous timer
  if (headTimer) {headTimer.stop()};

  spherePath.attr('d', path);
  graticulePath.attr('d', path);
  eyes
    .attr('cx', d => projection(d)[0])
    .attr('cy', d => projection(d)[1]);

  // Ensure all axes‐points start hidden
  if (axesPoints.length > 0) {
    axesPoints[0]
      .attr('r', 0)
      .style('opacity', 0);
  }

  let i = 0;
  const n = headData.length;
  const step = 2;
  const TICK = 1;

  headTimer = d3.interval(() => {
    if (i < n) {
      const d = headData[i];
      let dx = 0, dy = 0;

      if (currentView === 'front') {
        dx = d.x_mm * f;
        dy = -d.z_mm * f;
      } else if (currentView === 'top') {
        dx = d.x_mm * f;
        dy = -d.y_mm * f;
      } else if (currentView === 'side') {
        dx = d.y_mm * f;
        dy = d.z_mm * f;
      }

      projection.translate([baseTranslate[0] + dx, baseTranslate[1] + dy]);

      spherePath.attr('d', path);
      graticulePath.attr('d', path);
      eyes
        .attr('cx', pt => projection(pt)[0])
        .attr('cy', pt => projection(pt)[1]);

      if (axesPoints.length > 0) {
        axesPoints[0]
          .filter((dd, idx) => idx === i)
          .attr('r', 3)
          .style('opacity', 0.7);
      }

      i += step;
    } else {
      headTimer.stop();
    }
  }, TICK);
}

/*───────────────────────────────────────────────────────────────────────────────
  UPDATE VIEW
───────────────────────────────────────────────────────────────────────────────*/
function updateView() {
  // First, draw the head and set up projection/path/globals
  renderHead('#head');

  // Then, show/hide the appropriate axes container and render its points
  const viewMap = {
    front: { container: 'xz-front', xKey: 'x_mm', yKey: 'z_mm' },
    top:   { container: 'xy-top',  xKey: 'x_mm', yKey: 'y_mm' },
    side:  { container: 'yz-side', xKey: 'y_mm', yKey: 'z_mm' }
  };

  // Clear previous axesPoints, then draw new ones for the current view
  axesPoints = [];
  Object.entries(viewMap).forEach(([viewName, { container, xKey, yKey }]) => {
    if (viewName === currentView) {
      d3.select(`#${container}`)
        .style('display', 'block');
      renderAxesPlot(container, filteredData, xKey, yKey);
    } else {
      d3.select(`#${container}`)
        .style('display', 'none')
        .selectAll('svg').remove();
    }
  });

  // Finally, kick off the synced head + axes animation
  animateHeadTrajectory(filteredData);
}

/*───────────────────────────────────────────────────────────────────────────────
  MAIN INITIALIZATION (no async/await)
───────────────────────────────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  loadData('NM0004-cleaned').then(allData => {
    const demoGroup  = 'NM0004';
    const demoMarker = 'S5';
    const demoGenre  = 'silence';

    filteredData = allData.filter(d =>
      d.group  === demoGroup &&
      d.marker === demoMarker &&
      d.genre  === demoGenre
    );

    initializeViewToggle();
    updateView();
  });
});