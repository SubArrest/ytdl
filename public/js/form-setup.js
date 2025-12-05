// ---------- YouTube ID helpers ----------

const validQueryDomains = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "gaming.youtube.com",
]);

const validPathDomains =
  /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts|live)\/)/;

const idRegex = /^[a-zA-Z0-9_-]{11}$/;
const validateID = (id) => idRegex.test(id.trim());

// Parse any YouTube-ish value and return a clean 11-char video ID or null
function youtube_parser(link) {
  if (!link) return null;

  const trimmed = link.trim();

  // Case 1: bare ID
  if (validateID(trimmed)) return trimmed;

  // Case 2: "ID&list=...&t=..." pattern
  const ampIndex = trimmed.indexOf("&");
  if (ampIndex > 0) {
    const firstPart = trimmed.slice(0, ampIndex);
    if (validateID(firstPart)) return firstPart;
  }

  // Case 3: try as URL (with or without protocol)
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL("https://" + trimmed);
    } catch {
      return null;
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  let id = parsed.searchParams.get("v");

  // Path-based formats: youtu.be /shorts/ /embed/ /v/ /live/
  if (validPathDomains.test(parsed.href) && !id) {
    const paths = parsed.pathname.split("/").filter(Boolean);

    if (hostname === "youtu.be") {
      id = paths[0];
    } else {
      id = paths[1];
    }
  } else if (
    parsed.hostname &&
    !validQueryDomains.has(parsed.hostname)
  ) {
    return null;
  }

  if (!id) return null;

  id = id.substring(0, 11);
  if (!validateID(id)) return null;

  return id;
}

function makeWatchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

// Add/remove error styling on the input
function setInputValidity(input, isValid) {
  if (!input) return;
  if (isValid) {
    input.classList.remove("input-invalid");
  } else {
    input.classList.add("input-invalid");
  }
}

// ---------- Populate format dropdown ----------

const dropdown = document.getElementById("dropdown");

if (dropdown) {
  fetch("/ytdl/formats")
    .then((res) => res.json())
    .then((formats) => {
      Object.entries(formats).forEach(([category, types]) => {
        const group = document.createElement("optgroup");
        group.label = category.toUpperCase();

        types.forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type;
          if (type === "mp3") option.selected = true;
          group.appendChild(option);
        });

        dropdown.appendChild(group);
      });
    })
    .catch((err) => {
      console.error("Failed to load formats:", err);
    });
}

// ---------- Prefill + validation ----------

window.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const linkInput = document.querySelector('input[name="textField"]');
  if (!linkInput) return;

  const normaliseYoutube = (value) => {
    const id = youtube_parser(value);
    if (!id) return value.trim();
    return makeWatchUrl(id);
  };

  let linkFromUrl = url.searchParams.get("link");

  // If no ?link=..., use /ytdl/<something>
  if (!linkFromUrl) {
    const path = url.pathname;

    if (path && path !== "/ytdl/") {
      const tail = path.slice(6); // remove "/ytdl/"

      // If tail already starts with http(s), combine with current query as its ?...
      if (tail.startsWith("http://") || tail.startsWith("https://")) {
        const query = url.searchParams.toString();
        linkFromUrl = query ? `${tail}?${query}` : tail;
      } else {
        // Old behaviour: encoded URL or ID (including ID&list=...)
        try {
          linkFromUrl = decodeURIComponent(tail);
        } catch {
          console.warn("Failed to decode path as URL");
          linkFromUrl = tail;
        }
      }
    }
  }

  // Prefill from URL
  if (linkFromUrl) {
    const id = youtube_parser(linkFromUrl);
    if (id) {
      linkInput.value = makeWatchUrl(id);
      setInputValidity(linkInput, true);
    } else {
      linkInput.value = linkFromUrl.trim();
      setInputValidity(linkInput, false);
    }
  }

  // Live validation on input
  linkInput.addEventListener("input", () => {
    const value = linkInput.value;

    if (!value.trim()) {
      setInputValidity(linkInput, true);
      return;
    }

    const id = youtube_parser(value);
    setInputValidity(linkInput, !!id);
  });

  // On blur, normalise valid values into canonical watch URL
  linkInput.addEventListener("blur", () => {
    const value = linkInput.value;
    const id = youtube_parser(value);
    if (id) {
      linkInput.value = makeWatchUrl(id);
      setInputValidity(linkInput, true);
    }
  });
});
