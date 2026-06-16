"use client";

import Image from "next/image";
import { type ChangeEvent, type TouchEvent, useEffect, useMemo, useState } from "react";
import HTMLFlipBook from "react-pageflip";

type PdfJsModule = typeof import("pdfjs-dist");
type FlipBookProps = Omit<React.ComponentProps<typeof HTMLFlipBook>, "children">;

type FlipPdfViewerProps = {
  fileUrl: string;
  fileName: string;
  spreadSplitMode: SpreadSplitMode;
  spreadPageOrder: SpreadPageOrder;
  bookViewMode: BookViewMode;
};

const LARGE_PDF_PAGE_THRESHOLD = 30;
const VERY_LARGE_PDF_PAGE_THRESHOLD = 80;
const RENDER_YIELD_MS = 0;
const SPREAD_PAGE_ASPECT_RATIO = 1.35;
const BOOK_PAGE_ASPECT_RATIO = 0.7;

type BookViewMode = "single" | "spread" | "swipe";
type SpreadSplitMode = "auto" | "all" | "none";
type SpreadPageOrder = "left-to-right" | "right-to-left";
type ViewportSize = {
  width: number;
  height: number;
};

function isPdfFile(file: File): boolean {
  const hasPdfMimeType = file.type === "application/pdf";
  const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
  return hasPdfMimeType || hasPdfExtension;
}

function canvasToPageImages(
  canvas: HTMLCanvasElement,
  spreadSplitMode: SpreadSplitMode,
  spreadPageOrder: SpreadPageOrder
): string[] {
  const shouldSplit =
    spreadSplitMode === "all" ||
    (spreadSplitMode === "auto" && canvas.width / canvas.height >= SPREAD_PAGE_ASPECT_RATIO);

  if (!shouldSplit) {
    return [canvas.toDataURL("image/jpeg", 0.85)];
  }

  const halfWidth = Math.floor(canvas.width / 2);
  const rightWidth = canvas.width - halfWidth;
  const sourceRects =
    spreadPageOrder === "left-to-right"
      ? [
          { x: 0, width: halfWidth },
          { x: halfWidth, width: rightWidth },
        ]
      : [
          { x: halfWidth, width: rightWidth },
          { x: 0, width: halfWidth },
        ];

  return sourceRects.map(({ x, width }) => {
    const pageCanvas = document.createElement("canvas");
    const pageContext = pageCanvas.getContext("2d");

    if (!pageContext) {
      throw new Error("Canvas context could not be created.");
    }

    pageCanvas.width = width;
    pageCanvas.height = canvas.height;
    pageContext.drawImage(canvas, x, 0, width, canvas.height, 0, 0, width, canvas.height);

    return pageCanvas.toDataURL("image/jpeg", 0.85);
  });
}

function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 1280, height: 720 });

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  return viewportSize;
}

function getBookSize(viewMode: Exclude<BookViewMode, "swipe">, isFullscreen: boolean, viewportSize: ViewportSize) {
  const horizontalPadding = isFullscreen ? 48 : 32;
  const verticalPadding = isFullscreen ? 120 : 32;
  const pagesAcross = viewMode === "spread" ? 2 : 1;
  const maxBookWidth = Math.max(315, viewportSize.width - horizontalPadding);
  const maxBookHeight = Math.max(420, viewportSize.height - verticalPadding);
  const maxPageWidthByWidth = maxBookWidth / pagesAcross;
  const maxPageWidthByHeight = maxBookHeight * BOOK_PAGE_ASPECT_RATIO;
  const preferredPageWidth = isFullscreen ? 680 : 420;
  const pageWidth = Math.floor(Math.max(315, Math.min(preferredPageWidth, maxPageWidthByWidth, maxPageWidthByHeight)));

  return {
    width: pageWidth,
    height: Math.floor(pageWidth / BOOK_PAGE_ASPECT_RATIO),
  };
}

function SwipePageReader({
  pages,
  fileName,
  isFullscreen = false,
}: {
  pages: string[];
  fileName: string;
  isFullscreen?: boolean;
}) {
  const viewportSize = useViewportSize();
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const { width, height } = useMemo(
    () => getBookSize("single", isFullscreen, viewportSize),
    [isFullscreen, viewportSize]
  );
  const safeCurrentPageIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));

  const goToPreviousPage = () => {
    setCurrentPageIndex((index) => Math.max(0, index - 1));
  };

  const goToNextPage = () => {
    setCurrentPageIndex((index) => Math.min(pages.length - 1, index + 1));
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) {
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
    const swipeDistance = touchStartX - touchEndX;

    if (Math.abs(swipeDistance) > 48) {
      if (swipeDistance > 0) {
        goToNextPage();
      } else {
        goToPreviousPage();
      }
    }

    setTouchStartX(null);
  };

  return (
    <div className="mx-auto flex flex-col items-center gap-3" style={{ width }}>
      <div className="flex w-full items-center justify-between gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={goToPreviousPage}
          disabled={safeCurrentPageIndex === 0}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          前へ
        </button>
        <span>
          {safeCurrentPageIndex + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={goToNextPage}
          disabled={safeCurrentPageIndex === pages.length - 1}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          次へ
        </button>
      </div>

      <div
        className="w-full touch-pan-y overflow-hidden rounded-lg bg-neutral-100 shadow-sm"
        style={{ height }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${safeCurrentPageIndex * 100}%)` }}
        >
          {pages.map((src, index) => (
            <div key={`${fileName}-swipe-${index}`} className="relative h-full w-full shrink-0 bg-white">
              <Image
                src={src}
                alt={`${fileName} ${index + 1}ページ目`}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 680px"
                className="object-contain"
                priority={index === safeCurrentPageIndex}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlipBookRenderer({
  pages,
  fileName,
  viewMode,
  isFullscreen = false,
}: {
  pages: string[];
  fileName: string;
  viewMode: Exclude<BookViewMode, "swipe">;
  isFullscreen?: boolean;
}) {
  const viewportSize = useViewportSize();
  const { width, height } = useMemo(
    () => getBookSize(viewMode, isFullscreen, viewportSize),
    [isFullscreen, viewMode, viewportSize]
  );

  const flipBookProps: FlipBookProps = useMemo(
    () => ({
      width,
      height,
      showCover: false,
      mobileScrollSupport: false,
      className: "mx-auto",
      style: {},
      startPage: 0,
      size: "fixed",
      minWidth: width,
      maxWidth: width,
      minHeight: height,
      maxHeight: height,
      drawShadow: true,
      flippingTime: 900,
      usePortrait: viewMode === "single",
      startZIndex: 0,
      autoSize: false,
      maxShadowOpacity: 0.65,
      showPageCorners: true,
      disableFlipByClick: false,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 30,
    }),
    [height, viewMode, width]
  );

  return (
    <div className="overflow-auto px-1 py-2">
      <HTMLFlipBook key={`${viewMode}-${isFullscreen ? "fullscreen" : "inline"}-${width}-${height}`} {...flipBookProps}>
        {pages.map((src, index) => (
          <div key={`${fileName}-${index}`} className="relative h-full w-full overflow-hidden bg-white">
            <Image
              src={src}
              alt={`${fileName} ${index + 1}ページ目`}
              fill
              unoptimized
              sizes={viewMode === "spread" ? "(max-width: 768px) 50vw, 680px" : "(max-width: 768px) 100vw, 680px"}
              className="object-contain"
            />
          </div>
        ))}
      </HTMLFlipBook>
    </div>
  );
}

function BookRenderer({
  pages,
  fileName,
  viewMode,
  isFullscreen = false,
}: {
  pages: string[];
  fileName: string;
  viewMode: BookViewMode;
  isFullscreen?: boolean;
}) {
  if (viewMode === "swipe") {
    return (
      <div className="overflow-auto px-1 py-2">
        <SwipePageReader pages={pages} fileName={fileName} isFullscreen={isFullscreen} />
      </div>
    );
  }

  return <FlipBookRenderer pages={pages} fileName={fileName} viewMode={viewMode} isFullscreen={isFullscreen} />;
}

function FlipPdfViewer({ fileUrl, fileName, spreadSplitMode, spreadPageOrder, bookViewMode }: FlipPdfViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [splitPageCount, setSplitPageCount] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    if (!fileUrl) {
      setPages([]);
      setErrorMessage(null);
      setIsLoading(false);
      setLoadingStatus("");
      setSplitPageCount(0);
      return;
    }

    let isCancelled = false;

    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        setPages([]);
        setSplitPageCount(0);
        setLoadingStatus("PDFを解析しています…");

        const pdfjs: PdfJsModule = await import("pdfjs-dist");
        const workerVersion = pdfjs.version;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjs.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        const rendered: string[] = [];

        let scale = 1.3;
        if (pdf.numPages > LARGE_PDF_PAGE_THRESHOLD) {
          scale = 1.05;
        }
        if (pdf.numPages > VERY_LARGE_PDF_PAGE_THRESHOLD) {
          scale = 0.9;
        }

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (isCancelled) {
            return;
          }

          setLoadingStatus(`${pageNum} / ${pdf.numPages} ページを読み込み中…`);

          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas context could not be created.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({
            canvasContext: context,
            canvas,
            viewport,
          }).promise;

          const pageImages = canvasToPageImages(canvas, spreadSplitMode, spreadPageOrder);
          rendered.push(...pageImages);

          if (!isCancelled) {
            setPages([...rendered]);
            if (pageImages.length > 1) {
              setSplitPageCount((count) => count + 1);
            }
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), RENDER_YIELD_MS);
          });
        }

        if (!isCancelled) {
          setLoadingStatus("");
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : "PDFの読み込みに失敗しました。";
          setErrorMessage(message);
          setLoadingStatus("");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [fileUrl, spreadSplitMode, spreadPageOrder]);

  useEffect(() => {
    if (!isFullscreenOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreenOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreenOpen]);

  if (isLoading && pages.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-300 bg-white p-6 text-center shadow-sm">
        <p>PDFを読み込み中です…</p>
        {loadingStatus ? <p className="mt-2 text-sm text-neutral-500">{loadingStatus}</p> : null}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        <p className="font-semibold">PDFを表示できませんでした。</p>
        <p className="mt-2 break-all">{errorMessage}</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500 shadow-sm">
        PDFを選択すると、ここに本のような表示でプレビューします。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLoading && loadingStatus ? (
        <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
          {loadingStatus}
        </div>
      ) : null}
      {splitPageCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          横長の見開きページを {splitPageCount} 枚分、左右ページに分割しました。
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
        <span>
          {bookViewMode === "spread" ? "見開き表示中" : null}
          {bookViewMode === "single" ? "単ページ表示中" : null}
          {bookViewMode === "swipe" ? "スワイプ表示中" : null}
        </span>
        <button
          type="button"
          onClick={() => setIsFullscreenOpen(true)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          全画面で読む
        </button>
      </div>

      <div className="rounded-2xl bg-neutral-200 p-4 shadow-inner">
        <BookRenderer pages={pages} fileName={fileName} viewMode={bookViewMode} />
      </div>

      {isFullscreenOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 p-3 text-white sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-neutral-200">{fileName}</p>
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(false)}
              className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              閉じる
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-neutral-900 p-2 shadow-2xl">
            <BookRenderer pages={pages} fileName={fileName} viewMode={bookViewMode} isFullscreen />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [selectedFileUrl, setSelectedFileUrl] = useState<string>("");
  const [fileValidationMessage, setFileValidationMessage] = useState<string | null>(null);
  const [spreadSplitMode, setSpreadSplitMode] = useState<SpreadSplitMode>("auto");
  const [spreadPageOrder, setSpreadPageOrder] = useState<SpreadPageOrder>("right-to-left");
  const [bookViewMode, setBookViewMode] = useState<BookViewMode>("spread");

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!isPdfFile(file)) {
      setFileValidationMessage("PDFファイルのみアップロードできます。拡張子 .pdf のファイルを選択してください。");
      setSelectedFileName("");
      setSelectedFileUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return "";
      });
      input.value = "";
      return;
    }

    setFileValidationMessage(null);

    const objectUrl = URL.createObjectURL(file);
    setSelectedFileName(file.name);
    setSelectedFileUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return objectUrl;
    });
  };

  useEffect(() => {
    return () => {
      if (selectedFileUrl) {
        URL.revokeObjectURL(selectedFileUrl);
      }
    };
  }, [selectedFileUrl]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-900">PDFブックビューア</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          PDFをアップロードすると、各ページを画像化して本のようにめくれる表示で確認できます。
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <label htmlFor="pdf-upload" className="text-sm font-medium text-neutral-700">
            PDFファイルを選択
          </label>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700"
          />
          {selectedFileName ? (
            <p className="text-sm text-neutral-500">選択中: {selectedFileName}</p>
          ) : (
            <p className="text-sm text-neutral-400">まだPDFは選択されていません。</p>
          )}
          {fileValidationMessage ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fileValidationMessage}
            </p>
          ) : null}
          <p className="text-xs text-neutral-400">対応形式: PDF</p>
        </div>

        <div className="mt-6 grid gap-4 border-t border-neutral-200 pt-5 lg:grid-cols-3">
          <fieldset className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <legend className="font-medium text-neutral-900">本の表示</legend>
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="book-view-mode"
                  value="spread"
                  checked={bookViewMode === "spread"}
                  onChange={() => setBookViewMode("spread")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>
                  <span className="block">見開き</span>
                  <span className="block text-xs text-neutral-500">左にP1、右にP2のように2ページで表示します。</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="book-view-mode"
                  value="single"
                  checked={bookViewMode === "single"}
                  onChange={() => setBookViewMode("single")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>単ページ</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="book-view-mode"
                  value="swipe"
                  checked={bookViewMode === "swipe"}
                  onChange={() => setBookViewMode("swipe")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>
                  <span className="block">スワイプ</span>
                  <span className="block text-xs text-neutral-500">スマホで左右スワイプして1ページずつ送ります。</span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <legend className="font-medium text-neutral-900">見開きページの分割</legend>
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="spread-split-mode"
                  value="auto"
                  checked={spreadSplitMode === "auto"}
                  onChange={() => setSpreadSplitMode("auto")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>
                  <span className="block">自動判定</span>
                  <span className="block text-xs text-neutral-500">明らかに横長のページだけ分割します。</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="spread-split-mode"
                  value="all"
                  checked={spreadSplitMode === "all"}
                  onChange={() => setSpreadSplitMode("all")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>
                  <span className="block">すべて分割</span>
                  <span className="block text-xs text-neutral-500">正方形に近い見開きPDFはこちらを使います。</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="spread-split-mode"
                  value="none"
                  checked={spreadSplitMode === "none"}
                  onChange={() => setSpreadSplitMode("none")}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span>分割しない</span>
              </label>
            </div>
          </fieldset>

          <fieldset
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700"
            disabled={spreadSplitMode === "none"}
          >
            <legend className="font-medium text-neutral-900">分割後のページ順</legend>
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="spread-page-order"
                  value="right-to-left"
                  checked={spreadPageOrder === "right-to-left"}
                  onChange={() => setSpreadPageOrder("right-to-left")}
                  className="h-4 w-4 accent-neutral-900"
                />
                右ページから左ページへ
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="spread-page-order"
                  value="left-to-right"
                  checked={spreadPageOrder === "left-to-right"}
                  onChange={() => setSpreadPageOrder("left-to-right")}
                  className="h-4 w-4 accent-neutral-900"
                />
                左ページから右ページへ
              </label>
            </div>
          </fieldset>
        </div>
      </section>

      <section>
        <FlipPdfViewer
          fileUrl={selectedFileUrl}
          fileName={selectedFileName || "PDF"}
          spreadSplitMode={spreadSplitMode}
          spreadPageOrder={spreadPageOrder}
          bookViewMode={bookViewMode}
        />
      </section>
    </main>
  );
}
