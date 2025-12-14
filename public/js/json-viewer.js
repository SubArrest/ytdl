// Last JSON response (used by copy button)
let lastJsonData = null;

// Create a new line with indent
function createLine(level) {
  const line = document.createElement('div');
  line.className = 'json-line';

  const content = document.createElement('div');
  content.className = 'json-content';
  content.style.setProperty('--level', level);

  line.appendChild(content);

  return { line, content };
}

function isLinkField(key, value) {
  const linkKeys = ['qr', 'videourl', 'youtubeurl', 'image', 'discord'];
  return (
    typeof value === 'string' &&
    linkKeys.includes(key) &&
    /^https?:\/\//.test(value)
  );
}

// Render a JSON key (e.g. "id": )
function appendKeySpan(content, key) {
  if (key === null) return null;
  const keySpan = document.createElement('span');
  keySpan.className = 'json-key';
  keySpan.textContent = `"${key}": `;
  content.appendChild(keySpan);
  return keySpan;
}

// Render a primitive value (strings, numbers, booleans, null)
function createValueSpan(key, value) {
  const span = document.createElement('span');

  if (typeof value === 'string') {
    span.className = 'json-string';
    span.textContent = `"${value}"`;
    return span;
  }

  if (typeof value === 'number') {
    span.className = 'json-number';
    span.textContent = value;
    return span;
  }

  if (typeof value === 'boolean') {
    span.className = 'json-boolean';
    span.textContent = value;
    return span;
  }

  if (value === null) {
    span.className = 'json-null';
    span.textContent = 'null';
    return span;
  }

  return span;
}

// Recursively render any JSON value
function renderValue(value, level, key, isLast) {
  const type = Object.prototype.toString.call(value);

  // Primitive types
  if (type === '[object String]' && isLinkField(key, value)) {
    const { line, content } = createLine(level);

    const wrapper = document.createElement('span');
    wrapper.className = 'json-linkline';

    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = `"${key}": `;
    wrapper.appendChild(keySpan);

    const q1 = document.createElement('span');
    q1.className = 'json-quote';
    q1.textContent = `"`;
    wrapper.appendChild(q1);

    const a = document.createElement('a');
    a.href = value;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'json-link';
    a.textContent = value;
    wrapper.appendChild(a);

    const q2 = document.createElement('span');
    q2.className = 'json-quote';
    q2.textContent = `"`;
    wrapper.appendChild(q2);

    if (!isLast) {
      const comma = document.createElement('span');
      comma.className = 'json-comma';
      comma.textContent = ',';
      wrapper.appendChild(comma);
    }

    content.appendChild(wrapper);
    return line;
  }

  // Normal primitives: render normally (these should wrap)
  if (
    type === '[object String]' ||
    type === '[object Number]' ||
    type === '[object Boolean]' ||
    type === '[object Null]'
  ) {
    const { line, content } = createLine(level);
    appendKeySpan(content, key);

    const valueWrap = document.createElement('span');
    valueWrap.className = 'json-valuewrap';

    const vSpan = createValueSpan(key, value);
    valueWrap.appendChild(vSpan);

    if (!isLast) {
      const comma = document.createElement('span');
      comma.className = 'json-comma';
      comma.textContent = ',';
      valueWrap.appendChild(comma);
    }

    content.appendChild(valueWrap);
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

  if (!isLast) {
    const comma = document.createElement('span');
    comma.className = 'json-comma';
    comma.textContent = ',';
    closeContent.appendChild(comma);
  }

  block.appendChild(closeLine);

  return block;
}

// Render JSON into a container
function renderJsonInto(container, data) {
  container.innerHTML = '';
  const root = renderValue(data, 1, null, true);
  container.appendChild(root);
}

// Toggle collapse/expand on click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('json-toggle')) {
    const block = e.target.closest('.json-block');
    if (block) block.classList.toggle('collapsed');
  }
});
