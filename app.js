const SUPABASE_URL = "https://gftydfeqpuavajjzaeun.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_35lefXRrUU4MFrAATfghjQ_2EPkUgGy";
const STORAGE_BUCKET = "post-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LIKED_KEY = "today-pieces-liked-posts-v1";
const THEME_KEY = "today-pieces-theme-v1";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
);

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

let toastTimer;
let previewUrl;
let pendingDeletePost = null;
let likedPosts = readLikedPosts();

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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const item = document.createElement("div");
  item.className = "comment";
  item.dataset.commentId = comment.id;

  const bubble = document.createElement("div");
  bubble.className = "comment-bubble";

  const message = document.createElement("p");
  message.className = "comment-message";
  message.textContent = comment.message;

  const tools = document.createElement("div");
  tools.className = "comment-tools";

  const meta = document.createElement("time");
  meta.dateTime = comment.created_at;
  meta.textContent = formatDate(comment.created_at);

  const editButton = document.createElement("button");
  editButton.className = "comment-action";
  editButton.type = "button";
  editButton.dataset.action = "edit-comment";
  editButton.textContent = "EDIT";

  const deleteButton = document.createElement("button");
  deleteButton.className = "comment-action";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete-comment";
  deleteButton.textContent = "DEL";

  tools.append(meta, editButton, deleteButton);
  bubble.append(message, tools);

  const editForm = document.createElement("form");
  editForm.className = "comment-edit-form";
  editForm.hidden = true;

  const editInput = document.createElement("input");
  editInput.className = "comment-edit-input";
  editInput.maxLength = 280;
  editInput.required = true;
  editInput.value = comment.message;
  editInput.setAttribute("aria-label", "댓글 수정");

  const editSave = document.createElement("button");
  editSave.type = "submit";
  editSave.textContent = "SAVE";

  const editCancel = document.createElement("button");
  editCancel.type = "button";
  editCancel.dataset.action = "cancel-comment-edit";
  editCancel.textContent = "CANCEL";

  editForm.append(editInput, editSave, editCancel);
  item.append(bubble, editForm);
  return item;
}

function createSocialArea(post) {
  const social = document.createElement("section");
  social.className = "post-social";
  social.setAttribute("aria-label", "좋아요와 댓글");

  const socialTop = document.createElement("div");
  socialTop.className = "social-top";

  const heartButton = document.createElement("button");
  heartButton.className = "heart-button";
  heartButton.type = "button";
  heartButton.dataset.action = "like";
  heartButton.setAttribute("aria-label", "좋아요");
  heartButton.innerHTML = `<span aria-hidden="true">${likedPosts[post.id] ? "♥" : "♡"}</span><strong>${post.likes_count || 0}</strong>`;
  if (likedPosts[post.id]) {
    heartButton.classList.add("is-liked");
    heartButton.disabled = true;
  }

  const commentCount = document.createElement("span");
  commentCount.className = "comment-count";
  const comments = getPostComments(post);
  commentCount.textContent = `${comments.length} comment${comments.length === 1 ? "" : "s"}`;

  socialTop.append(heartButton, commentCount);

  const commentList = document.createElement("div");
  commentList.className = "comments";
  if (comments.length) {
    commentList.append(...comments.map(createCommentElement));
  }

  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";

  const commentInput = document.createElement("input");
  commentInput.className = "comment-input";
  commentInput.maxLength = 280;
  commentInput.required = true;
  commentInput.placeholder = "say less, comment more";
  commentInput.setAttribute("aria-label", "댓글");

  const commentButton = document.createElement("button");
  commentButton.type = "submit";
  commentButton.textContent = "SEND";

  commentForm.append(commentInput, commentButton);
  social.append(socialTop, commentList, commentForm);
  return social;
}

function createPostElement(post) {
  const article = document.createElement("article");
  article.className = "post";
  article.dataset.postId = post.id;
  article.dataset.imagePath = post.image_path || "";

  if (post.image_path) {
    const imageWrap = document.createElement("div");
    imageWrap.className = "post-image-wrap";

    const image = document.createElement("img");
    image.className = "post-image";
    image.src = getPublicImageUrl(post.image_path);
    image.alt = "게시글에 첨부된 사진";
    image.loading = "lazy";

    imageWrap.append(image);
    article.append(imageWrap);
  }

  const body = document.createElement("div");
  body.className = "post-body";

  const metaRow = document.createElement("div");
  metaRow.className = "post-meta-row";

  const meta = document.createElement("time");
  meta.className = "post-meta";
  meta.dateTime = post.created_at;
  meta.textContent = formatDate(post.created_at);

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const editButton = document.createElement("button");
  editButton.className = "post-action";
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.textContent = "EDIT";
  editButton.setAttribute("aria-label", "게시물 수정");

  const deleteButton = document.createElement("button");
  deleteButton.className = "post-action";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.textContent = "DELETE";
  deleteButton.setAttribute("aria-label", "게시물 삭제");

  actions.append(editButton, deleteButton);
  metaRow.append(meta, actions);

  const message = document.createElement("p");
  message.className = "post-message";
  message.textContent = post.message;

  const editForm = document.createElement("form");
  editForm.className = "edit-form";
  editForm.hidden = true;

  const editMessage = document.createElement("textarea");
  editMessage.className = "edit-message";
  editMessage.maxLength = 500;
  editMessage.required = true;
  editMessage.value = post.message;
  editMessage.setAttribute("aria-label", "게시물 내용 수정");

  const editMediaRow = document.createElement("div");
  editMediaRow.className = "edit-media-row";

  const editPhotoLabel = document.createElement("label");
  editPhotoLabel.className = "edit-photo-button";
  editPhotoLabel.textContent = post.image_path ? "REPLACE PIC" : "ADD A PIC";

  const editPhotoInput = document.createElement("input");
  editPhotoInput.className = "edit-photo-input";
  editPhotoInput.type = "file";
  editPhotoInput.accept = ALLOWED_TYPES.join(",");

  const editFileName = document.createElement("span");
  editFileName.className = "edit-file-name";
  editFileName.textContent = "NO NEW FILE";

  editPhotoLabel.append(editPhotoInput);
  editMediaRow.append(editPhotoLabel, editFileName);

  if (post.image_path) {
    const removePhotoButton = document.createElement("button");
    removePhotoButton.className = "remove-photo-button";
    removePhotoButton.type = "button";
    removePhotoButton.dataset.action = "remove-photo";
    removePhotoButton.dataset.removeImage = "false";
    removePhotoButton.textContent = "REMOVE PIC";
    editMediaRow.append(removePhotoButton);
  }

  const editActions = document.createElement("div");
  editActions.className = "edit-actions";

  const editCancel = document.createElement("button");
  editCancel.className = "edit-cancel";
  editCancel.type = "button";
  editCancel.dataset.action = "cancel-edit";
  editCancel.textContent = "CANCEL";

  const editSave = document.createElement("button");
  editSave.className = "edit-save";
  editSave.type = "submit";
  editSave.textContent = "SAVE CHANGES";

  editActions.append(editCancel, editSave);
  editForm.append(editMessage, editMediaRow, editActions);

  body.append(metaRow, message, editForm, createSocialArea(post));
  article.append(body);
  return article;
}

async function loadPosts({ quiet = false } = {}) {
  if (!quiet) {
    status.textContent = "기록을 불러오는 중...";
    feed.replaceChildren();
  }

  refreshButton.disabled = true;
  const { data, error } = await db
    .from("posts")
    .select(
      "id, message, image_path, created_at, likes_count, comments(id, post_id, message, created_at, updated_at)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  refreshButton.disabled = false;

  if (error) {
    status.textContent = "기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
    showToast(`불러오기 실패: ${error.message}`);
    return;
  }

  status.textContent = "";
  feed.replaceChildren();

  if (!data.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      "<strong>THE TIMELINE IS EMPTY</strong>첫 번째 조각을 툭 던져보세요. 아무 말이나 진짜 환영.";
    feed.append(empty);
    return;
  }

  feed.append(...data.map(createPostElement));
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
  charCount.textContent = `${messageInput.value.length} / 500`;
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
    showToast(`수정 실패: ${error.message}`);
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
    showToast(`좋아요 실패: ${error.message}`);
  }
}

async function addComment(commentForm) {
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
    });
    if (error) throw error;

    input.value = "";
    showToast("댓글을 남겼어요.");
    await loadPosts({ quiet: true });
  } catch (error) {
    showToast(`댓글 실패: ${error.message}`);
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
    showToast(`댓글 수정 실패: ${error.message}`);
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
    showToast(`댓글 삭제 실패: ${error.message}`);
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
    showToast(`삭제 실패: ${error.message}`);
  } finally {
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "YEP, DELETE";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    showToast(`기록 실패: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "POST IT";
  }
});

loadPosts();
