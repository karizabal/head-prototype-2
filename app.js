import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

/*───────────────────────────────────────────────────────────────────────────────
  GLOBAL VARIABLES
───────────────────────────────────────────────────────────────────────────────*/
let projection, path, spherePath, graticulePath, eyes;
let axesPoints = [];
let currentView = 'front';
let allData = []; // holds rows from NM0001, NM0004, NM0011
let filteredData = []; // holds subset after filtering
let headTimer = null;

/*───────────────────────────────────────────────────────────────────────────────
  GENRE COLOR ENCODING
───────────────────────────────────────────────────────────────────────────────*/
const genreToColor = {
  silence: d3.interpolateBlues,
  salsa: d3.interpolateOranges,
  meditation: d3.interpolateGreens,
  edm: d3.interpolateReds,
};

/*───────────────────────────────────────────────────────────────────────────────
  LOAD SINGLE CSV FILE (returns array)
───────────────────────────────────────────────────────────────────────────────*/
function loadData(filename) {
  return d3
    .csv(`./data/${filename}.csv`)
    .then((raw) =>
      raw.map((d) => ({
        group: d.group,
        marker: d.marker,
        block: d.block,
        genre: d.genre,
        time_s: +d.time_s,
        x_mm: +d.x_mm,
        y_mm: +d.y_mm,
        z_mm: +d.z_mm,
      }))
    )
    .catch((err) => {
      console.error(`Error loading ${filename}:`, err);
      return [];
    });
}

/*───────────────────────────────────────────────────────────────────────────────
  FILTER FUNCTION (from graphs.js)
───────────────────────────────────────────────────────────────────────────────*/
function getObjectsByValue(data, selectedGroup, selectedMarker, selectedGenre) {
  if (selectedGenre === 'silence') {
    return data.filter(
      (d) =>
        d.group === selectedGroup &&
        d.marker === selectedMarker &&
        d.genre === 'silence' &&
        d.block === '1'
    );
  }
  return data.filter(
    (d) =>
      d.group === selectedGroup &&
      d.marker === selectedMarker &&
      d.genre === selectedGenre
  );
}

/*───────────────────────────────────────────────────────────────────────────────
  RENDER HEAD SPHERE
───────────────────────────────────────────────────────────────────────────────*/
function renderHead(containerSelector) {
  d3.select(containerSelector).selectAll('svg').remove();
  const svg = d3
    .select(containerSelector)
    .append('svg')
    .attr('viewBox', '0 0 600 600')
    .style('width', '100%')
    .style('height', 'auto');

  let rotation;
  if (currentView === 'top') {
    rotation = [0, -90, 0];
  } else if (currentView === 'side') {
    rotation = [90, 0, 0];
  } else {
    rotation = [0, 0, 0];
  }

  projection = d3
    .geoOrthographic()
    .scale(100)
    .translate([300, 300])
    .rotate(rotation)
    .clipAngle(90);

  path = d3.geoPath(projection);

  const defs = svg.append('defs');
  const grad = defs
    .append('linearGradient')
    .attr('id', 'shade')
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 300)
    .attr('y1', 0)
    .attr('x2', 300)
    .attr('y2', 600);

  grad.append('stop').attr('offset', '10%').attr('stop-color', '#FFF9C4');
  grad.append('stop').attr('offset', '90%').attr('stop-color', '#FDD835');

  const g = svg.append('g');

  spherePath = g
    .append('path')
    .datum({ type: 'Sphere' })
    .attr('d', path)
    .attr('fill', 'url(#shade)')
    .attr('stroke', '#666')
    .attr('stroke-width', 1);

  graticulePath = g
    .append('path')
    .datum(d3.geoGraticule()())
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#666')
    .attr('stroke-width', 0.5);

  eyes = g
    .selectAll('circle.eye')
    .data([
      [-25, 10],
      [25, 10],
    ])
    .join('circle')
    .attr('class', 'eye')
    .attr('r', 10)
    .attr('fill', '#333')
    .attr('cx', (d) => projection(d)[0])
    .attr('cy', (d) => projection(d)[1]);
}

/*───────────────────────────────────────────────────────────────────────────────
  RENDER AXES PLOT
───────────────────────────────────────────────────────────────────────────────*/
function renderAxesPlot(containerId, data, xKey, yKey) {
  d3.select(`#${containerId}`).selectAll('svg').remove();
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 300 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  const svg = d3
    .select(`#${containerId}`)
    .append('svg')
    .attr(
      'viewBox',
      `0 0 ${width + margin.left + margin.right} ${
        height + margin.top + margin.bottom
      }`
    )
    .style('width', '100%')
    .style('height', 'auto')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xExtent = d3.extent(data, (d) => d[xKey]);
  const yExtent = d3.extent(data, (d) => d[yKey]);

  const xScale = d3
    .scaleLinear()
    .domain([xExtent[0] - 10, xExtent[1] + 10])
    .range([0, width]);

  const yScale = d3
    .scaleLinear()
    .domain([yExtent[0] - 10, yExtent[1] + 10])
    .range([height, 0]);

  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale));

  svg.append('g').call(d3.axisLeft(yScale));

  // Determine color scale based on genre and time
  const genre = data[0]?.genre || 'silence';
  const interp = genreToColor[genre] || d3.interpolateViridis;
  const timeExtent = d3.extent(data, (d) => d.time_s);
  const colorScale = d3.scaleSequential(interp).domain(timeExtent);

  // Plot points using colorScale
  const pts = svg
    .selectAll('circle.point')
    .data(data)
    .enter()
    .append('circle')
    .attr('class', 'point')
    .attr('cx', (d) => xScale(d[xKey]))
    .attr('cy', (d) => yScale(d[yKey]))
    .attr('r', 0)
    .attr('fill', (d) => colorScale(d.time_s))
    .style('opacity', 0);

  axesPoints.push(pts);

  // Add hover targets for tooltips
  svg
    .selectAll('circle.hover-target')
    .data(data)
    .enter()
    .append('circle')
    .attr('class', 'hover-target')
    .attr('cx', (d) => xScale(d[xKey]))
    .attr('cy', (d) => yScale(d[yKey]))
    .attr('r', 8)
    .attr('fill', 'transparent')
    .on('mouseover', (event, d) => {
      tooltip
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 25}px`)
        .style('display', 'block').html(`
          <strong>${xKey}:</strong> ${d[xKey].toFixed(3)}<br/>
          <strong>${yKey}:</strong> ${d[yKey].toFixed(3)}<br/>
          <strong>time (s):</strong> ${d.time_s.toFixed(2)}
        `);
    })
    .on('mousemove', (event) => {
      tooltip
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 25}px`);
    })
    .on('mouseout', () => {
      tooltip.style('display', 'none');
    });

  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .text(`${xKey}`);

  svg
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .text(`${yKey}`);
}

/*───────────────────────────────────────────────────────────────────────────────
  RENDER MINI HEAD
───────────────────────────────────────────────────────────────────────────────*/
function renderMiniHead(containerSelector, view) {
  d3.select(containerSelector).selectAll('svg').remove();
  const svg = d3
    .select(containerSelector)
    .append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '50px')
    .style('height', '50px')
    .style('cursor', 'pointer');

  let rotation;
  if (view === 'top') {
    rotation = [0, -90, 0];
  } else if (view === 'side') {
    rotation = [90, 0, 0];
  } else {
    rotation = [0, 0, 0];
  }

  const miniProj = d3
    .geoOrthographic()
    .scale(30)
    .translate([50, 50])
    .rotate(rotation)
    .clipAngle(90);

  const miniPath = d3.geoPath(miniProj);

  const defs = svg.append('defs');
  const grad = defs
    .append('linearGradient')
    .attr('id', `shade-mini-${view}`)
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 50)
    .attr('y1', 0)
    .attr('x2', 50)
    .attr('y2', 100);

  grad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF9C4');
  grad.append('stop').attr('offset', '100%').attr('stop-color', '#FDD835');

  const g = svg.append('g');
  g.append('circle')
    .attr('cx', 50)
    .attr('cy', 50)
    .attr('r', 30)
    .attr('fill', `url(#shade-mini-${view})`)
    .attr('stroke', '#aaa')
    .attr('stroke-width', 1);

  g.append('path')
    .datum(d3.geoGraticule()())
    .attr('d', miniPath)
    .attr('fill', 'none')
    .attr('stroke', '#aaa')
    .attr('stroke-width', 0.5);

  g.selectAll('circle.eye-mini')
    .data([
      [-25, 5],
      [25, 5],
    ])
    .join('circle')
    .attr('class', 'eye-mini')
    .attr('r', 4)
    .attr('fill', '#333')
    .attr('cx', (d) => miniProj(d)[0])
    .attr('cy', (d) => miniProj(d)[1]);
}

/*───────────────────────────────────────────────────────────────────────────────
  HEAD + AXES ANIMATION
───────────────────────────────────────────────────────────────────────────────*/
function animateHeadTrajectory(headData) {
  const f = 3.5;
  const baseTranslate = [300, 300];

  if (headTimer) {
    headTimer.stop();
  }

  spherePath.attr('d', path);
  graticulePath.attr('d', path);
  eyes.attr('cx', (d) => projection(d)[0]).attr('cy', (d) => projection(d)[1]);

  if (axesPoints.length > 0) {
    axesPoints[0].attr('r', 0).style('opacity', 0);
  }

  let i = 0;
  const n = headData.length;
  const step = 2;
  const TICK = 1;

  headTimer = d3.interval(() => {
    if (i < n) {
      const d = headData[i];
      let dx = 0,
        dy = 0;

      if (currentView === 'front') {
        dx = d.x_mm * f;
        dy = -d.z_mm * f;
      } else if (currentView === 'top') {
        dx = d.x_mm * f;
        dy = -d.y_mm * f;
      } else {
        dx = d.y_mm * f;
        dy = -d.z_mm * f;
      }

      projection.translate([baseTranslate[0] + dx, baseTranslate[1] + dy]);
      spherePath.attr('d', path);
      graticulePath.attr('d', path);
      eyes
        .attr('cx', (pt) => projection(pt)[0])
        .attr('cy', (pt) => projection(pt)[1]);

      if (axesPoints.length > 0) {
        axesPoints[0]
          .filter((_, idx) => idx === i)
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
  VIEW‐TOGGLE LOGIC
───────────────────────────────────────────────────────────────────────────────*/
function initializeViewToggle() {
  const container = d3.select('#view-toggle');
  container.html('');

  const legend = container
    .append('div')
    .attr('id', 'view-legend')
    .style('display', 'flex')
    .style('gap', '0.5rem')
    .style('justify-content', 'center');

  ['front', 'top', 'side'].forEach((view) => {
    const item = legend
      .append('div')
      .attr('class', 'legend-item')
      .attr('data-view', view)
      .style('display', 'flex')
      .style('flex-direction', 'column')
      .style('align-items', 'center')
      .style('cursor', 'pointer')
      .on('click', function () {
        currentView = view;
        d3.selectAll('.legend-item').classed('active', false);
        d3.select(this).classed('active', true);
        updateView();
      });

    renderMiniHead(item.node(), view);

    item
      .append('span')
      .text(view[0].toUpperCase() + view.slice(1))
      .style('font-size', '10px')
      .style('margin-top', '2px');
  });

  d3.select('.legend-item[data-view="front"]').classed('active', true);
}

/*───────────────────────────────────────────────────────────────────────────────
  TOOLTIP SETUP (unchanged)
───────────────────────────────────────────────────────────────────────────────*/
const tooltip = d3
  .select('body')
  .append('div')
  .attr('class', 'd3-tooltip')
  .style('position', 'absolute')
  .style('pointer-events', 'none')
  .style('padding', '4px 8px')
  .style('background', 'rgba(255,255,255,0.9)')
  .style('border', '1px solid #ccc')
  .style('border-radius', '4px')
  .style('font-size', '12px')
  .style('display', 'none');

/*───────────────────────────────────────────────────────────────────────────────
  UPDATE VIEW
───────────────────────────────────────────────────────────────────────────────*/
function updateView() {
  renderHead('#head');

  axesPoints = [];
  if (currentView === 'front') {
    d3.select('#xz-front').style('display', 'block');
    d3.select('#xy-top').style('display', 'none');
    d3.select('#yz-side').style('display', 'none');
    renderAxesPlot('xz-front', filteredData, 'x_mm', 'z_mm');
  } else if (currentView === 'top') {
    d3.select('#xy-top').style('display', 'block');
    d3.select('#xz-front').style('display', 'none');
    d3.select('#yz-side').style('display', 'none');
    renderAxesPlot('xy-top', filteredData, 'x_mm', 'y_mm');
  } else {
    d3.select('#yz-side').style('display', 'block');
    d3.select('#xz-front').style('display', 'none');
    d3.select('#xy-top').style('display', 'none');
    renderAxesPlot('yz-side', filteredData, 'y_mm', 'z_mm');
  }

  animateHeadTrajectory(filteredData);
}

/*───────────────────────────────────────────────────────────────────────────────
  FILTER + RENDER LOGIC
───────────────────────────────────────────────────────────────────────────────*/
function updateAxesGraph() {
  let selectedGroup = d3.select('#group-filter').property('value');
  let selectedMarker = d3.select('#marker-filter').property('value');
  let selectedGenre = d3.select('#genre-filter').property('value');

  function applyFilters() {
    filteredData = getObjectsByValue(
      allData,
      selectedGroup,
      selectedMarker,
      selectedGenre
    );
    updateView();
  }

  applyFilters();

  // attach listeners
  d3.select('#group-filter').on('change', function () {
    selectedGroup = d3.select(this).property('value');
    applyFilters();
  });
  d3.select('#marker-filter').on('change', function () {
    selectedMarker = d3.select(this).property('value');
    applyFilters();
  });
  d3.select('#genre-filter').on('change', function () {
    selectedGenre = d3.select(this).property('value');
    applyFilters();
  });
}

/*───────────────────────────────────────────────────────────────────────────────
  MAIN INITIALIZATION
───────────────────────────────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', async () => {
  const [data1, data4, data11] = await Promise.all([
    loadData('NM0001-cleaned'),
    loadData('NM0004-cleaned'),
    loadData('NM0011-cleaned'),
  ]);
  allData = [...data1, ...data4, ...data11];

  const groups = Array.from(new Set(allData.map((d) => d.group)));
  d3.select('#group-filter')
    .selectAll('option')
    .data(groups)
    .enter()
    .append('option')
    .attr('value', (d) => d)
    .text((d) => d);

  const markers = Array.from(new Set(allData.map((d) => d.marker)));
  d3.select('#marker-filter')
    .selectAll('option')
    .data(markers)
    .enter()
    .append('option')
    .attr('value', (d) => d)
    .text((d) => d);

  initializeViewToggle();
  updateAxesGraph();
});
