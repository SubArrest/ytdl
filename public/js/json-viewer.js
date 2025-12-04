// Last JSON response (used by copy button)
let lastJsonData = null;

// Create a new line with indent
function createLine(level) {
  const line = document.createElement('div');
  line.className = 'json-line';

  const content = document.createElement('div');
  const indent = document.createElement('span');

  indent.className = 'json-indent';
  indent.style.setProperty('--level', level);

  content.appendChild(indent);
  line.appendChild(content);

  return { line, content, indent };
}

// Render a JSON key (e.g. "id": )
function appendKeySpan(content, key) {
  if (key === null) return;
  const keySpan = document.createElement('span');
  keySpan.className = 'json-key';
  keySpan.textContent = `"${key}": `;
  content.appendChild(keySpan);
}

// Render a primitive value (strings, numbers, booleans, null)
function createValueSpan(key, value) {
  const span = document.createElement('span');

  if (typeof value === 'string') {
    const linkKeys = ['qr', 'videourl', 'youtubeurl', 'image', 'discord'];

    // URL-like fields as clickable links
    if (linkKeys.includes(key) && /^https?:\/\//.test(value)) {
      span.className = 'json-string';
      const a = document.createElement('a');
      a.href = value;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'json-link';
      a.textContent = value;
      span.textContent = '"';
      span.appendChild(a);
      span.appendChild(document.createTextNode('"'));
      return span;
    }

    span.className = 'json-string';
    span.textContent = `"${value}"`;
  } else if (typeof value === 'number') {
    span.className = 'json-number';
    span.textContent = value;
  } else if (typeof value === 'boolean') {
    span.className = 'json-boolean';
    span.textContent = value;
  } else if (value === null) {
    span.className = 'json-null';
    span.textContent = 'null';
  }

  return span;
}

// Recursively render any JSON value
function renderValue(value, level, key, isLast) {
  const type = Object.prototype.toString.call(value);

  // Primitive types
  if (
    type === '[object String]' ||
    type === '[object Number]' ||
    type === '[object Boolean]' ||
    type === '[object Null]'
  ) {
    const { line, content } = createLine(level);
    appendKeySpan(content, key);

    const vSpan = createValueSpan(key, value);
    content.appendChild(vSpan);

    if (!isLast) content.appendChild(document.createTextNode(','));

    return line;
  }

  // Objects / arrays (collapsible blocks)
  const isArray = type === '[object Array]';
  const block = document.createElement('div');
  block.className = 'json-block';

  // Opening line
  const { line: openLine, content: openContent } = createLine(level);
  openLine.classList.add('json-line-open');

  const toggle = document.createElement('span');
  toggle.className = 'json-toggle';
  toggle.textContent = '▾';
  openContent.appendChild(toggle);

  appendKeySpan(openContent, key);

  const braceOpen = document.createElement('span');
  braceOpen.className = 'json-brace';
  braceOpen.textContent = isArray ? '[' : '{';
  openContent.appendChild(braceOpen);

  block.appendChild(openLine);

  // Children
  const children = document.createElement('div');
  children.className = 'json-children';

  if (isArray) {
    const len = value.length;
    value.forEach((item, idx) => {
      children.appendChild(renderValue(item, level + 1, null, idx === len - 1));
    });
  } else {
    const entries = Object.entries(value);
    entries.forEach(([k, v], idx) => {
      children.appendChild(
        renderValue(v, level + 1, k, idx === entries.length - 1)
      );
    });
  }

  block.appendChild(children);

  // Closing line
  const { line: closeLine, content: closeContent } = createLine(level);
  const braceClose = document.createElement('span');
  braceClose.className = 'json-brace';
  braceClose.textContent = isArray ? ']' : '}';
  closeContent.appendChild(braceClose);

  if (!isLast) closeContent.appendChild(document.createTextNode(','));

  block.appendChild(closeLine);

  return block;
}

// Render JSON into a container
function renderJsonInto(container, data) {
  container.innerHTML = '';
  const root = renderValue(data, 0, null, true);
  container.appendChild(root);
}

// Toggle collapse/expand on click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('json-toggle')) {
    const block = e.target.closest('.json-block');
    if (block) block.classList.toggle('collapsed');
  }
});
