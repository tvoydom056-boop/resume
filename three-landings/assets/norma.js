const body = document.body;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setupReveal() {
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    return;
  }
  body.classList.add("motion-ready");
  const page = document.querySelector(".case-page");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  page.classList.add("reveal");
  observer.observe(page);
}

function setupLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox || typeof lightbox.showModal !== "function") {
    return;
  }

  const stage = lightbox.querySelector(".lightbox__stage");
  const image = lightbox.querySelector(".lightbox__img");
  const navButtons = lightbox.querySelectorAll(".lightbox__nav");
  const sources = Array.from(document.querySelectorAll(".case-view .case-figure > img, .case-view .case-scheme__link img"));
  let current = null;
  let isZoomed = false;
  let isZoomable = false;
  let drag = null;
  let dragged = false;
  let backdropPixels = null;

  // у схем (user flow, скелетоны) свой светлый фон занимает почти весь экран просмотра,
  // поэтому клик по пустому фону самой схемы тоже считается кликом мимо картинки
  function readBackdropPixels() {
    backdropPixels = null;
    if (!current || !current.closest(".case-scheme__link") || !image.naturalWidth) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    backdropPixels = context;
  }

  function isSchemeBackdrop(event) {
    if (!backdropPixels) {
      return false;
    }
    const rect = image.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * image.naturalWidth);
    const y = Math.floor((event.clientY - rect.top) / rect.height * image.naturalHeight);
    // соседние пиксели тоже проверяются, чтобы клик по тонкой стрелке или краю плашки не закрывал просмотр
    const size = 7;
    const data = backdropPixels.getImageData(x - 3, y - 3, size, size).data;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 242) > 6 || Math.abs(data[i + 1] - 242) > 6 || Math.abs(data[i + 2] - 240) > 6) {
        return false;
      }
    }
    return true;
  }

  function setImageScale(scale) {
    image.style.width = `${Math.round(image.naturalWidth * scale)}px`;
    image.style.height = `${Math.round(image.naturalHeight * scale)}px`;
  }

  // картинка вписывается в экран целиком (мелкие увеличиваются не больше чем вдвое)
  function fitImage() {
    if (!lightbox.open || isZoomed || !image.naturalWidth) {
      return;
    }
    const styles = window.getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const height = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    const scale = Math.min(2, width / image.naturalWidth, height / image.naturalHeight);
    setImageScale(scale);
    isZoomable = scale < 0.85;
    lightbox.classList.toggle("is-zoomable", isZoomable);
    lightbox.classList.remove("is-loading");
  }

  // полный размер; точка, по которой кликнули, остаётся под курсором
  function zoomIn(event) {
    const rect = image.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    isZoomed = true;
    lightbox.classList.add("is-zoomed");
    setImageScale(1);
    const stageRect = stage.getBoundingClientRect();
    stage.scrollLeft = image.offsetLeft + x * image.offsetWidth - (event.clientX - stageRect.left);
    stage.scrollTop = image.offsetTop + y * image.offsetHeight - (event.clientY - stageRect.top);
  }

  function zoomOut() {
    isZoomed = false;
    lightbox.classList.remove("is-zoomed");
    stage.scrollTo(0, 0);
    fitImage();
  }

  // листаются только картинки того же кейса, по кругу
  function caseSources() {
    const view = current.closest(".case-view");
    return sources.filter((source) => source.closest(".case-view") === view);
  }

  function show(source) {
    current = source;
    isZoomed = false;
    lightbox.classList.remove("is-zoomed", "is-zoomable");
    lightbox.classList.add("is-loading");
    image.src = source.currentSrc || source.src;
    image.alt = source.alt;
    // скругление как у превью
    image.style.borderRadius = window.getComputedStyle(source).borderRadius;
    navButtons.forEach((button) => {
      button.hidden = caseSources().length < 2;
    });
    stage.scrollTo(0, 0);
    backdropPixels = null;
    if (image.complete) {
      readBackdropPixels();
      fitImage();
    }
  }

  function step(delta) {
    const list = caseSources();
    show(list[(list.indexOf(current) + delta + list.length) % list.length]);
  }

  function open(source) {
    body.classList.add("lightbox-open");
    lightbox.showModal();
    show(source);
  }

  sources.forEach((source) => {
    const link = source.closest("a");
    if (!link) {
      source.tabIndex = 0;
      source.setAttribute("role", "button");
      source.setAttribute("aria-label", source.alt ? `${source.alt} — открыть крупнее` : "открыть изображение крупнее");
      // пробел срабатывает на отпускание, как у обычной кнопки: иначе отпускание
      // попадёт на стрелку просмотра, которая уже получила фокус, и сразу перелистнёт
      source.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          open(source);
        } else if (event.key === " ") {
          event.preventDefault();
        }
      });
      source.addEventListener("keyup", (event) => {
        if (event.key === " ") {
          open(source);
        }
      });
    }
    // у схем остаётся ссылка на файл — без скрипта она по-прежнему открывает его в новой вкладке
    (link || source).addEventListener("click", (event) => {
      event.preventDefault();
      open(source);
    });
  });

  image.addEventListener("load", () => {
    readBackdropPixels();
    fitImage();
  });
  window.addEventListener("resize", fitImage);

  lightbox.addEventListener("pointerdown", () => {
    dragged = false;
  });

  // перетаскивание мышью в полном размере; на телефоне картинку двигает обычная прокрутка
  stage.addEventListener("pointerdown", (event) => {
    if (!isZoomed || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!dragged && Math.abs(dx) + Math.abs(dy) < 5) {
      return;
    }
    dragged = true;
    lightbox.classList.add("is-dragging");
    stage.scrollLeft = drag.left - dx;
    stage.scrollTop = drag.top - dy;
  });

  window.addEventListener("pointerup", () => {
    drag = null;
    lightbox.classList.remove("is-dragging");
  });

  navButtons.forEach((button) => {
    button.addEventListener("click", () => step(Number(button.dataset.step)));
  });

  // в полном размере стрелки клавиатуры прокручивают картинку, а не листают
  lightbox.addEventListener("keydown", (event) => {
    if (isZoomed || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  });

  lightbox.addEventListener("click", (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (event.target.closest(".lightbox__nav")) {
      return;
    }
    if (event.target !== image || isSchemeBackdrop(event)) {
      lightbox.close();
    } else if (isZoomed) {
      zoomOut();
    } else if (isZoomable) {
      zoomIn(event);
    }
  });

  lightbox.addEventListener("close", () => {
    isZoomed = false;
    drag = null;
    lightbox.classList.remove("is-zoomed", "is-zoomable", "is-dragging");
    body.classList.remove("lightbox-open");
    image.removeAttribute("src");
  });

  window.addEventListener("hashchange", () => {
    if (lightbox.open) {
      lightbox.close();
    }
  });
}

setupReveal();
setupLightbox();
