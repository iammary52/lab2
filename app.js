const SUPABASE_URL = "https://gftydfeqpuavajjzaeun.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_35lefXRrUU4MFrAATfghjQ_2EPkUgGy";
const STORAGE_BUCKET = "post-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

let toastTimer;
let previewUrl;

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

function createPostElement(post) {
  const article = document.createElement("article");
  article.className = "post";

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

  const meta = document.createElement("time");
  meta.className = "post-meta";
  meta.dateTime = post.created_at;
  meta.textContent = formatDate(post.created_at);

  const message = document.createElement("p");
  message.className = "post-message";
  message.textContent = post.message;

  body.append(meta, message);
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
    .select("id, message, image_path, created_at")
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
      "<strong>아직 남겨진 조각이 없어요.</strong>첫 번째 오늘을 기록해보세요.";
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
  submitButton.querySelector("span").textContent = "기록 중...";
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
    submitButton.querySelector("span").textContent = "기록하기";
  }
});

loadPosts();
