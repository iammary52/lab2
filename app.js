const SUPABASE_URL = "https://gftydfeqpuavajjzaeun.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_35lefXRrUU4MFrAATfghjQ_2EPkUgGy";
const STORAGE_BUCKET = "post-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LIKED_KEY = "today-pieces-liked-posts-v1";
const THEME_KEY = "today-pieces-theme-v1";
const AUTH_REDIRECT_URL = "https://iammary52.github.io/lab2/";
const LEGACY_AUTHOR_ID = "ad490b76-13dd-4b24-9979-10ca2555783f";

const MESSAGE_MAXLEN = 500;
const COMMENT_MAXLEN = 280;
const FEED_LIMIT = 50;
const TOAST_DURATION = 3200;
const REALTIME_DEBOUNCE = 600;
const TIME_TICK = 60 * 1000;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Tiny declarative element builder.
 * `props` maps to DOM properties when possible, otherwise attributes.
 * Special keys: `class`, `dataset` (object), `html` (innerHTML).
 * Nullish / false children and props are skipped.
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "html") node.innerHTML = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

const form = document.querySelector("#post-form");
const messageInput = document.querySelector("#message");
const photoInput = document.querySelector("#photo");
const submitButton = document.querySelector("#submit-button");
const refreshButton = document.querySelector("#refresh-button");
const feed = document.querySelector("#feed");
const status = document.querySelector("#status");
const charCount = document.querySelector("#char-count");
const previewWrap = document.querySelector("#image-preview-wrap");
const preview = document.querySelector("#image-preview");
const removeImageButton = document.querySelector("#remove-image");
const toast = document.querySelector("#toast");
const deleteDialog = document.querySelector("#delete-dialog");
const cancelDeleteButton = document.querySelector("#cancel-delete");
const confirmDeleteButton = document.querySelector("#confirm-delete");
const themeButtons = [...document.querySelectorAll(".theme-choice")];
const openAuthButton = document.querySelector("#open-auth");
const authSession = document.querySelector("#auth-session");
const authEmail = document.querySelector("#auth-email");
const signOutButton = document.querySelector("#sign-out");
const authDialog = document.querySelector("#auth-dialog");
const closeAuthButton = document.querySelector("#close-auth");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authEmailInput = document.querySelector("#auth-email-input");
const authPasswordInput = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const authMessage = document.querySelector("#auth-message");
const authTabs = [...document.querySelectorAll(".auth-tab")];
const photoButton = document.querySelector(".photo-button");

let toastTimer;
let previewUrl;
let pendingDeletePost = null;
let likedPosts = readLikedPosts();
let currentUser = null;
let authMode = "signin";
const seenPostIds = new Set();

function setTheme(theme) {
  const nextTheme = theme === "hitel" ? "hitel" : "default";
  document.body.dataset.theme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  themeButtons.forEach((button) => {
    const isActive = button.dataset.themeChoice === nextTheme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

setTheme(localStorage.getItem(THEME_KEY));

themeButtons.forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

function readLikedPosts() {
  try {
    return JSON.parse(sessionStorage.getItem(LIKED_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLikedPosts() {
  sessionStorage.setItem(LIKED_KEY, JSON.stringify(likedPosts));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), TOAST_DURATION);
}

function errorToast(prefix, error) {
  showToast(`${prefix}: ${error?.message ?? error}`);
}

function isOwner(authorId) {
  return Boolean(currentUser && currentUser.id === authorId);
}

function getAuthorLabel(authorId) {
  if (authorId === LEGACY_AUTHOR_ID) return "A@NAVER.COM";
  if (isOwner(authorId)) return "YOU";
  return `MEMBER ${String(authorId).slice(0, 4).toUpperCase()}`;
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "signin";
  const isSignup = authMode === "signup";
  authTitle.textContent = isSignup ? "Join the timeline" : "Welcome back";
  authSubmit.textContent = isSignup ? "CREATE ACCOUNT" : "LOGIN";
  authPasswordInput.autocomplete = isSignup
    ? "new-password"
    : "current-password";
  authMessage.textContent = "";
  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authMode === authMode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });
}

function openAuth(mode = "signin") {
  setAuthMode(mode);
  if (!authDialog.open) authDialog.showModal();
  authEmailInput.focus();
}

function renderAuthState() {
  const signedIn = Boolean(currentUser);
  openAuthButton.hidden = signedIn;
  authSession.hidden = !signedIn;
  authEmail.textContent = signedIn ? currentUser.email : "";

  if (signedIn && authDialog.open) authDialog.close();
}

async function initializeAuth() {
  const { data, error } = await db.auth.getSession();
  if (error) errorToast("세션 확인 실패", error);
  currentUser = data.session?.user || null;
  renderAuthState();
  await loadPosts();
  subscribeToChanges();

  db.auth.onAuthStateChange((_event, session) => {
    const previousId = currentUser?.id;
    currentUser = session?.user || null;
    renderAuthState();
    if (previousId !== currentUser?.id) {
      setTimeout(() => loadPosts({ quiet: true }), 0);
    }
  });
}

/**
 * Auto-refresh the feed when posts, comments or likes change server-side.
 * Reloads are debounced and quiet; if Realtime is disabled on the project
 * the subscription simply never fires and manual refresh keeps working.
 */
function subscribeToChanges() {
  let timer;
  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => loadPosts({ quiet: true }), REALTIME_DEBOUNCE);
  };

  db.channel("today-pieces-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      bump,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments" },
      bump,
    )
    .subscribe();
}

const relativeFormatter = new Intl.RelativeTimeFormat("ko", {
  numeric: "auto",
});

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Human friendly "3분 전" style label; falls back to a full date past a week. */
function formatRelative(value) {
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < 45 * 1000) return "방금 전";
  if (abs < hour) return relativeFormatter.format(Math.round(diff / minute), "minute");
  if (abs < day) return relativeFormatter.format(Math.round(diff / hour), "hour");
  if (abs < 7 * day) return relativeFormatter.format(Math.round(diff / day), "day");
  return formatDate(value);
}

function createTime(value, className) {
  return el("time", {
    class: className,
    dateTime: value,
    title: formatDate(value),
    dataset: { ts: value },
    textContent: formatRelative(value),
  });
}

/** Keep every rendered timestamp fresh without re-fetching the feed. */
function refreshTimestamps() {
  feed.querySelectorAll("time[data-ts]").forEach((node) => {
    node.textContent = formatRelative(node.dataset.ts);
  });
}

function getPublicImageUrl(path) {
  if (!path) return null;
  return db.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function getPostComments(post) {
  return [...(post.comments || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
}

function createCommentElement(comment) {
  const owner = isOwner(comment.author_id);

  const bubble = el(
    "div",
    { class: "comment-bubble" },
    el("p", { class: "comment-message", textContent: comment.message }),
    el(
      "div",
      { class: "comment-tools" },
      createTime(comment.created_at),
      el("span", {
        class: "comment-author",
        textContent: getAuthorLabel(comment.author_id),
      }),
      owner &&
        el("button", {
          class: "comment-action",
          type: "button",
          dataset: { action: "edit-comment" },
          textContent: "EDIT",
        }),
      owner &&
        el("button", {
          class: "comment-action",
          type: "button",
          dataset: { action: "delete-comment" },
          textContent: "DEL",
        }),
    ),
  );

  const editForm = el(
    "form",
    { class: "comment-edit-form", hidden: true },
    el("input", {
      class: "comment-edit-input",
      maxLength: COMMENT_MAXLEN,
      required: true,
      value: comment.message,
      "aria-label": "댓글 수정",
    }),
    el("button", { type: "submit", textContent: "SAVE" }),
    el("button", {
      type: "button",
      dataset: { action: "cancel-comment-edit" },
      textContent: "CANCEL",
    }),
  );

  return el(
    "div",
    { class: "comment", dataset: { commentId: comment.id } },
    bubble,
    editForm,
  );
}

function createSocialArea(post) {
  const comments = getPostComments(post);
  const liked = Boolean(likedPosts[post.id]);

  const heartButton = el("button", {
    class: liked ? "heart-button is-liked" : "heart-button",
    type: "button",
    disabled: liked,
    dataset: { action: "like" },
    "aria-label": "좋아요",
    html: `<span aria-hidden="true">${liked ? "♥" : "♡"}</span><strong>${post.likes_count || 0}</strong>`,
  });

  const socialTop = el(
    "div",
    { class: "social-top" },
    heartButton,
    el("span", {
      class: "comment-count",
      textContent: `${comments.length} comment${comments.length === 1 ? "" : "s"}`,
    }),
  );

  const commentList = el("div", { class: "comments" });
  if (comments.length) commentList.append(...comments.map(createCommentElement));

  const commentForm = el(
    "form",
    { class: "comment-form" },
    el("input", {
      class: "comment-input",
      maxLength: COMMENT_MAXLEN,
      required: true,
      readOnly: !currentUser,
      placeholder: currentUser ? "say less, comment more" : "login to comment",
      "aria-label": "댓글",
    }),
    el("button", {
      type: "submit",
      textContent: "SEND",
      disabled: !currentUser,
    }),
  );

  return el(
    "section",
    { class: "post-social", "aria-label": "좋아요와 댓글" },
    socialTop,
    commentList,
    commentForm,
  );
}

function createEditForm(post) {
  const mediaRow = el(
    "div",
    { class: "edit-media-row" },
    el(
      "label",
      {
        class: "edit-photo-button",
        textContent: post.image_path ? "REPLACE PIC" : "ADD A PIC",
      },
      el("input", {
        class: "edit-photo-input",
        type: "file",
        accept: ALLOWED_TYPES.join(","),
      }),
    ),
    el("span", { class: "edit-file-name", textContent: "NO NEW FILE" }),
    post.image_path &&
      el("button", {
        class: "remove-photo-button",
        type: "button",
        dataset: { action: "remove-photo", removeImage: "false" },
        textContent: "REMOVE PIC",
      }),
  );

  return el(
    "form",
    { class: "edit-form", hidden: true },
    el("textarea", {
      class: "edit-message",
      maxLength: MESSAGE_MAXLEN,
      required: true,
      value: post.message,
      "aria-label": "게시물 내용 수정",
    }),
    mediaRow,
    el(
      "div",
      { class: "edit-actions" },
      el("button", {
        class: "edit-cancel",
        type: "button",
        dataset: { action: "cancel-edit" },
        textContent: "CANCEL",
      }),
      el("button", {
        class: "edit-save",
        type: "submit",
        textContent: "SAVE CHANGES",
      }),
    ),
  );
}

function createPostElement(post) {
  const isNew = !seenPostIds.has(post.id);
  seenPostIds.add(post.id);

  const article = el("article", {
    class: isNew ? "post is-new" : "post",
    dataset: { postId: post.id, imagePath: post.image_path || "" },
  });

  if (post.image_path) {
    article.append(
      el(
        "div",
        { class: "post-image-wrap" },
        el("img", {
          class: "post-image",
          src: getPublicImageUrl(post.image_path),
          alt: "게시글에 첨부된 사진",
          loading: "lazy",
        }),
      ),
    );
  }

  const owner = isOwner(post.author_id);
  const metaRow = el(
    "div",
    { class: "post-meta-row" },
    createTime(post.created_at, "post-meta"),
    el("span", {
      class: "post-author",
      textContent: getAuthorLabel(post.author_id),
    }),
    owner &&
      el(
        "div",
        { class: "post-actions" },
        el("button", {
          class: "post-action",
          type: "button",
          dataset: { action: "edit" },
          textContent: "EDIT",
          "aria-label": "게시물 수정",
        }),
        el("button", {
          class: "post-action",
          type: "button",
          dataset: { action: "delete" },
          textContent: "DELETE",
          "aria-label": "게시물 삭제",
        }),
      ),
  );

  const body = el(
    "div",
    { class: "post-body" },
    metaRow,
    el("p", { class: "post-message", textContent: post.message }),
    createEditForm(post),
    createSocialArea(post),
  );

  article.append(body);
  return article;
}

function renderSkeletons(count = 4) {
  feed.replaceChildren(
    ...Array.from({ length: count }, () =>
      el(
        "article",
        { class: "post skeleton", "aria-hidden": "true" },
        el("div", { class: "skeleton-image" }),
        el(
          "div",
          { class: "post-body" },
          el("div", { class: "skeleton-line short" }),
          el("div", { class: "skeleton-line" }),
          el("div", { class: "skeleton-line" }),
        ),
      ),
    ),
  );
}

async function loadPosts({ quiet = false } = {}) {
  if (!quiet) {
    status.textContent = "";
    renderSkeletons();
  }

  refreshButton.disabled = true;
  const { data, error } = await db
    .from("posts")
    .select(
      "id, message, image_path, created_at, likes_count, author_id, comments(id, post_id, message, created_at, updated_at, author_id)",
    )
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  refreshButton.disabled = false;

  if (error) {
    feed.replaceChildren();
    status.textContent = "기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
    errorToast("불러오기 실패", error);
    return;
  }

  status.textContent = "";

  if (!data.length) {
    feed.replaceChildren(
      el("div", {
        class: "empty",
        html: "<strong>THE TIMELINE IS EMPTY</strong>첫 번째 조각을 툭 던져보세요. 아무 말이나 진짜 환영.",
      }),
    );
    return;
  }

  feed.replaceChildren(...data.map(createPostElement));
}

function clearSelectedImage() {
  photoInput.value = "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute("src");
  previewWrap.hidden = true;
}

function validatePhoto(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("JPG, PNG, WEBP, GIF 사진만 올릴 수 있어요.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("사진은 10MB보다 작아야 해요.");
  }
}

async function uploadPhoto(file) {
  validatePhoto(file);
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) throw error;
  return path;
}

messageInput.addEventListener("input", () => {
  charCount.textContent = `${messageInput.value.length} / ${MESSAGE_MAXLEN}`;
});

messageInput.addEventListener("focus", () => {
  if (!currentUser) openAuth("signup");
});

// Ctrl / Cmd + Enter posts straight from the textarea.
messageInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});

photoButton.addEventListener("click", (event) => {
  if (currentUser) return;
  event.preventDefault();
  openAuth("signup");
});

photoInput.addEventListener("change", () => {
  const [file] = photoInput.files;
  if (!file) return clearSelectedImage();

  try {
    validatePhoto(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    previewWrap.hidden = false;
  } catch (error) {
    clearSelectedImage();
    showToast(error.message);
  }
});

removeImageButton.addEventListener("click", clearSelectedImage);
refreshButton.addEventListener("click", () => loadPosts());

function setEditMode(article, enabled) {
  const message = article.querySelector(".post-message");
  const editForm = article.querySelector(".edit-form");
  const editButton = article.querySelector('[data-action="edit"]');
  if (!editForm || !editButton) return;

  message.hidden = enabled;
  editForm.hidden = !enabled;
  editButton.textContent = enabled ? "EDITING" : "EDIT";
  editButton.disabled = enabled;

  if (enabled) {
    editForm.querySelector(".edit-message").focus();
  }
}

function setCommentEditMode(comment, enabled) {
  const bubble = comment.querySelector(".comment-bubble");
  const editForm = comment.querySelector(".comment-edit-form");
  const input = comment.querySelector(".comment-edit-input");

  bubble.hidden = enabled;
  editForm.hidden = !enabled;
  if (enabled) input.focus();
}

feed.addEventListener("change", (event) => {
  if (!event.target.matches(".edit-photo-input")) return;

  const input = event.target;
  const fileName = input
    .closest(".edit-media-row")
    .querySelector(".edit-file-name");
  const [file] = input.files;

  if (!file) {
    fileName.textContent = "NO NEW FILE";
    return;
  }

  try {
    validatePhoto(file);
    fileName.textContent = file.name;
    const removeButton = input
      .closest(".edit-media-row")
      .querySelector(".remove-photo-button");
    if (removeButton) {
      removeButton.dataset.removeImage = "false";
      removeButton.classList.remove("is-active");
      removeButton.textContent = "REMOVE PIC";
    }
  } catch (error) {
    input.value = "";
    fileName.textContent = "NO NEW FILE";
    showToast(error.message);
  }
});

feed.addEventListener("click", (event) => {
  if (!currentUser && event.target.closest(".comment-input")) {
    openAuth("signup");
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const article = button.closest(".post");
  const action = button.dataset.action;
  const comment = button.closest(".comment");

  if (action === "like") {
    likePost(button);
    return;
  }

  if (action === "edit-comment") {
    setCommentEditMode(comment, true);
    return;
  }

  if (action === "cancel-comment-edit") {
    const input = comment.querySelector(".comment-edit-input");
    input.value = comment.querySelector(".comment-message").textContent;
    setCommentEditMode(comment, false);
    return;
  }

  if (action === "delete-comment") {
    deleteComment(comment);
    return;
  }

  if (action === "edit") {
    feed.querySelectorAll(".post").forEach((postArticle) => {
      if (postArticle !== article) setEditMode(postArticle, false);
    });
    setEditMode(article, true);
  }

  if (action === "cancel-edit") {
    const formElement = article.querySelector(".edit-form");
    formElement.querySelector(".edit-message").value =
      article.querySelector(".post-message").textContent;
    formElement.querySelector(".edit-photo-input").value = "";
    formElement.querySelector(".edit-file-name").textContent = "NO NEW FILE";
    const removeButton = formElement.querySelector(".remove-photo-button");
    if (removeButton) {
      removeButton.dataset.removeImage = "false";
      removeButton.classList.remove("is-active");
      removeButton.textContent = "REMOVE PIC";
    }
    setEditMode(article, false);
  }

  if (action === "remove-photo") {
    const shouldRemove = button.dataset.removeImage !== "true";
    button.dataset.removeImage = String(shouldRemove);
    button.classList.toggle("is-active", shouldRemove);
    button.textContent = shouldRemove ? "PIC WILL BE REMOVED" : "REMOVE PIC";
    if (shouldRemove) {
      const input = article.querySelector(".edit-photo-input");
      input.value = "";
      article.querySelector(".edit-file-name").textContent = "NO NEW FILE";
    }
  }

  if (action === "delete") {
    pendingDeletePost = {
      article,
      id: Number(article.dataset.postId),
      imagePath: article.dataset.imagePath || null,
    };
    deleteDialog.showModal();
  }
});

feed.addEventListener("submit", async (event) => {
  if (event.target.matches(".comment-form")) {
    event.preventDefault();
    await addComment(event.target);
    return;
  }

  if (event.target.matches(".comment-edit-form")) {
    event.preventDefault();
    await editComment(event.target);
    return;
  }

  if (!event.target.matches(".edit-form")) return;
  event.preventDefault();

  const editForm = event.target;
  const article = editForm.closest(".post");
  const id = Number(article.dataset.postId);
  const oldImagePath = article.dataset.imagePath || null;
  const message = editForm.querySelector(".edit-message").value.trim();
  const [newFile] = editForm.querySelector(".edit-photo-input").files;
  const removeButton = editForm.querySelector(".remove-photo-button");
  const shouldRemoveImage = removeButton?.dataset.removeImage === "true";
  const saveButton = editForm.querySelector(".edit-save");

  if (!message) {
    showToast("수정할 내용을 입력해주세요.");
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "SAVING...";
  let uploadedImagePath = null;

  try {
    if (newFile) uploadedImagePath = await uploadPhoto(newFile);

    const nextImagePath = uploadedImagePath
      ? uploadedImagePath
      : shouldRemoveImage
        ? null
        : oldImagePath;

    const { error } = await db
      .from("posts")
      .update({ message, image_path: nextImagePath })
      .eq("id", id);
    if (error) throw error;

    if (oldImagePath && oldImagePath !== nextImagePath) {
      const { error: storageError } = await db.storage
        .from(STORAGE_BUCKET)
        .remove([oldImagePath]);
      if (storageError) {
        console.warn("Old image cleanup failed", storageError);
      }
    }

    showToast("게시물을 수정했어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    if (uploadedImagePath) {
      await db.storage.from(STORAGE_BUCKET).remove([uploadedImagePath]);
    }
    errorToast("수정 실패", error);
    saveButton.disabled = false;
    saveButton.textContent = "SAVE CHANGES";
  }
});

async function likePost(button) {
  const article = button.closest(".post");
  const id = Number(article.dataset.postId);
  if (likedPosts[id]) return;

  button.disabled = true;

  try {
    const { data, error } = await db.rpc("increment_post_like", {
      target_post_id: id,
    });
    if (error) throw error;

    likedPosts[id] = true;
    writeLikedPosts();
    button.classList.add("is-liked");
    button.querySelector("span").textContent = "♥";
    button.querySelector("strong").textContent = data;
  } catch (error) {
    button.disabled = false;
    errorToast("좋아요 실패", error);
  }
}

async function addComment(commentForm) {
  if (!currentUser) {
    openAuth("signup");
    return;
  }

  const article = commentForm.closest(".post");
  const input = commentForm.querySelector(".comment-input");
  const button = commentForm.querySelector("button");
  const message = input.value.trim();

  if (!message) {
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "SENDING...";

  try {
    const { error } = await db.from("comments").insert({
      post_id: Number(article.dataset.postId),
      message,
      author_id: currentUser.id,
    });
    if (error) throw error;

    input.value = "";
    showToast("댓글을 남겼어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    errorToast("댓글 실패", error);
  } finally {
    button.disabled = false;
    button.textContent = "SEND";
  }
}

async function editComment(commentForm) {
  const comment = commentForm.closest(".comment");
  const input = commentForm.querySelector(".comment-edit-input");
  const button = commentForm.querySelector("button[type='submit']");
  const message = input.value.trim();

  if (!message) {
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "SAVING...";

  try {
    const { error } = await db
      .from("comments")
      .update({ message, updated_at: new Date().toISOString() })
      .eq("id", Number(comment.dataset.commentId));
    if (error) throw error;

    showToast("댓글을 수정했어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    errorToast("댓글 수정 실패", error);
  } finally {
    button.disabled = false;
    button.textContent = "SAVE";
  }
}

async function deleteComment(comment) {
  if (!window.confirm("이 댓글을 삭제할까요?")) return;

  try {
    const { error } = await db
      .from("comments")
      .delete()
      .eq("id", Number(comment.dataset.commentId));
    if (error) throw error;

    showToast("댓글을 삭제했어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    errorToast("댓글 삭제 실패", error);
  }
}

cancelDeleteButton.addEventListener("click", () => {
  pendingDeletePost = null;
  deleteDialog.close();
});

deleteDialog.addEventListener("close", () => {
  if (!confirmDeleteButton.disabled) pendingDeletePost = null;
});

confirmDeleteButton.addEventListener("click", async () => {
  if (!pendingDeletePost) return;

  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "DELETING...";
  const { id, imagePath } = pendingDeletePost;

  try {
    const { error } = await db.from("posts").delete().eq("id", id);
    if (error) throw error;

    if (imagePath) {
      const { error: storageError } = await db.storage
        .from(STORAGE_BUCKET)
        .remove([imagePath]);
      if (storageError) {
        console.warn("Image cleanup failed", storageError);
      }
    }

    deleteDialog.close();
    pendingDeletePost = null;
    showToast("게시물을 삭제했어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    errorToast("삭제 실패", error);
  } finally {
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "YEP, DELETE";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) {
    openAuth("signup");
    showToast("가입 또는 로그인 후 게시할 수 있어요.");
    return;
  }

  const message = messageInput.value.trim();
  const [file] = photoInput.files;
  if (!message) {
    showToast("짧은 메모를 남겨주세요.");
    messageInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "POSTING...";
  let imagePath = null;

  try {
    if (file) imagePath = await uploadPhoto(file);

    const { error } = await db.from("posts").insert({
      message,
      image_path: imagePath,
      author_id: currentUser.id,
    });
    if (error) throw error;

    form.reset();
    messageInput.dispatchEvent(new Event("input"));
    clearSelectedImage();
    showToast("오늘의 조각을 남겼어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    if (imagePath) {
      await db.storage.from(STORAGE_BUCKET).remove([imagePath]);
    }
    errorToast("기록 실패", error);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "POST IT";
  }
});

openAuthButton.addEventListener("click", () => openAuth("signin"));
closeAuthButton.addEventListener("click", () => authDialog.close());
authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  authSubmit.disabled = true;
  authSubmit.textContent =
    authMode === "signup" ? "CREATING..." : "LOGGING IN...";
  authMessage.textContent = "";

  try {
    if (authMode === "signup") {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      });
      if (error) throw error;

      if (data.session) {
        showToast("가입과 로그인이 완료됐어요.");
      } else {
        authMessage.textContent =
          "인증 이메일을 보냈어요. 이메일 인증 후 로그인해주세요.";
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authForm.reset();
      showToast("로그인했어요.");
    }
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent =
      authMode === "signup" ? "CREATE ACCOUNT" : "LOGIN";
  }
});

signOutButton.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) {
    errorToast("로그아웃 실패", error);
    return;
  }
  showToast("로그아웃했어요.");
});

setInterval(refreshTimestamps, TIME_TICK);
initializeAuth();
