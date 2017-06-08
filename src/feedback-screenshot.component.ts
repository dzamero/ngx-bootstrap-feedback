import {ChangeDetectorRef, Component, Input} from "@angular/core";
import {FeedbackService} from "./feedback.service";
import {FeedbackConfiguration} from "./feedback-configuration.model";


declare let html2canvas: any;

const CANVAS_ID = "feedback-canvas";
const HIGHLIGHT_CLASS = "feedback-highlight";
const FEEDBACK_BTN_CLASS = "btn-feedback";

@Component({
  selector: "ngx-bootstrap-feedback-screenshot",
  templateUrl: "./feedback-screenshot.html",
})
export class FeedbackScreenshotComponent {

  @Input()
  configuration: FeedbackConfiguration;

  screenshots: string[] = [];

  /* Canvas */
  private canvas: HTMLCanvasElement;
  private canvasContext: CanvasRenderingContext2D;
  private isDrawing = false;
  private centerX: number;
  private centerY: number;
  private highlight: HTMLDivElement;
  private highlightLeft: number;
  private highlightTop: number;
  private highlightWidth: number;
  private highlightHeight: number;
  private preRenderScrollPosition: number;

  constructor(private changeDetection: ChangeDetectorRef, private feedback: FeedbackService) {
    feedback.screenshotComponent = this;
  }

  /**
   * Add transparent background to canvas.
   */
  private addCanvasAlphaBackground(): void {
    if (!this.canvasContext) {
      throw Error("User feedback context does not exist");
    }

    this.canvasContext.fillStyle = "rgba(102,102,102,0.5)";
    this.canvasContext.fillRect(0, 0, document.body.clientWidth, document.body.clientHeight);
  }

  /**
   * Add a screenshot from local machine.
   * @param event the event of selecting image.
   */
  public addScreenshot(event: any): void {
    let reader = new FileReader();
    let file = event.target.files[0];
    if (file) {
      reader.onload = (evnt: any) => {
        this.screenshots.push(evnt.target.result);
        this.changeDetection.detectChanges();
        event.target.value = "";
      };
      reader.readAsDataURL(file);
    }

  }

  /**
   * Adjust the drawing according to user movement.
   * @param x the x-axis movement position.
   * @param y the y-axis movement position.
   */
  private adjustDrawing(x: number, y: number): void {
    if (this.isDrawing) {
      const width = x - this.centerX;
      const height = y - this.centerY;

      this.canvasContext.clearRect(0, 0, document.body.clientWidth, document.body.clientHeight);
      this.addCanvasAlphaBackground();
      this.canvasContext.clearRect(this.centerX, this.centerY, width, height);

      this.redraw();
    }
  }

  /**
   * Clear all screenshots.
   */
  public clearScreenshots(): void {
    this.screenshots = [];
    this.changeDetection.detectChanges();
  }

  /**
   * Create a canvas of the page.
   */
  private createCanvas(): void {
    if (!this.canvasContext) {
      let canvas = document.createElement("canvas");
      canvas.setAttribute("id", CANVAS_ID);
      canvas.setAttribute("width", String(document.body.clientWidth));
      canvas.setAttribute("height", String(document.body.clientHeight));
      canvas.setAttribute("style", "top: 0");

      document.body.appendChild(canvas);

      this.canvas = canvas;
      this.canvasContext = canvas.getContext("2d");

      this.setupMouseDrawingEvents();
      this.addCanvasAlphaBackground();
    }
  }

  /**
   * Destroy the page canvas.
   */
  public destroyCanvas(): void {
    if (this.canvas) {
      this.canvas.remove();
    }

    let highlights = document.getElementsByClassName(HIGHLIGHT_CLASS);
    /* Remove all page highlights. */
    for (let i = 0; i < highlights.length; i++) {
      let highlight = highlights[i];
      highlight.remove();

    }

    this.canvasContext = null;
  }

  /**
   * Enter the screenshot mode.
   */
  public enterScreenshotMode(): void {
    if (this.configuration.onEnterTakeScreenshot) {
      this.configuration.onEnterTakeScreenshot();
    }

    this.feedback.buttonComponent.isHidden = false;
    this.feedback.buttonComponent.isScreenshotMode = true;
    this.feedback.modalComponent.hideModal();
    this.createCanvas();
  }

  /**
   * Finish drawing at given position.
   * @param x the x-axis page position to finish at.
   * @param y the y-axis page position to finish at.
   */
  private finishDrawing(x: number, y: number): void {
    this.isDrawing = false;

    const width = x - this.centerX;
    const height = y - this.centerY;

    /* If below 10 pixels, consider just a click.*/
    if (width < 10 && height < 10) {
      return;
    }

    /* Fill drawn canvas (highlight) with transparency. */
    this.canvasContext.fillStyle = "rgba(0,0,0,0)";
    this.canvasContext.strokeRect(this.centerX, this.centerY, width, height);
    this.canvasContext.fillRect(this.centerX, this.centerY, width, height);

    /* Remove old element. */
    if (this.highlight) {
      this.highlight.remove();
    }

    /* Create a highlight document element. */
    this.highlight = document.createElement("div");
    this.highlight.setAttribute("style", "position:absolute;top:" + this.centerY
      + "px;left:" + this.centerX
      + "px;width:" + width
      + "px;height:" + height
      + "px;z-index:30000;");
    this.highlight.setAttribute("class", HIGHLIGHT_CLASS);

    this.highlightLeft = this.centerX;
    this.highlightTop = this.centerY;
    this.highlightWidth = width;
    this.highlightHeight = height;

    /* Add highlight div to body. */
    document.body.appendChild(this.highlight);

    this.redraw();

    if (this.configuration.onHighlightDrawn) {
      this.configuration.onHighlightDrawn(this.highlight);
    }
  }

  /**
   * Process rendered screenshot.
   * @param canvas the canvas.
   */
  private processRenderedScreenshot(canvas: any): void {
    this.feedback.setScreenshotMode(false);
    this.feedback.showFeedbackModal();
    this.feedback.unlockTakeScreenshotButtons();
    this.feedback.hideSendFeedbackButton();

    this.destroyCanvas();

    canvas.style.width = "100%";
    canvas.style.borderRadius = "12px";

    let sizingCanvas: HTMLCanvasElement = null;

    /* Handle screenshot highlight case. */
    if (this.configuration.screenshotOnlyHighlighted) {
      /* Create canvas of highlight area.*/
      sizingCanvas = document.createElement("canvas");

      sizingCanvas.width = this.highlightWidth;
      sizingCanvas.height = this.highlightHeight;

      sizingCanvas.getContext("2d").drawImage(canvas, -this.highlightLeft, -this.highlightTop,
        canvas.width, canvas.height);
    }

    setTimeout(() => {

      let screenshotBase64 = this.configuration.screenshotOnlyHighlighted ? sizingCanvas.toDataURL() : canvas.toDataURL();
      this.screenshots.push(screenshotBase64);
      this.changeDetection.detectChanges();
      document.body.scrollTop = this.preRenderScrollPosition; // Reset scroll.
      document.body.style["overflow"] = null; // Reset scrolling.
      document.body.classList.remove("wait"); // Set body cursor back to normal.
      this.canvas.classList.remove("wait"); // Set canvas cursor back to normal.

      if (this.configuration.onScreenshotTaken) {
        this.configuration.onScreenshotTaken(screenshotBase64);
      }
    });
  }

  /**
   * Redraw the canvas context.
   */
  private redraw(): void {
    let highlights = document.getElementsByClassName(HIGHLIGHT_CLASS);

    for (let i = 0; i < highlights.length; i++) {
      let highlight = highlights[i];

      let style = highlight.getAttribute("style");
      let left =  style[<any>"left"];
      let top = style[<any>"top"];
      let width = style[<any>"width"];
      let height = style[<any>"height"];

      this.canvasContext.clearRect(parseInt(left, 10),
        parseInt(top, 10),
        parseInt(width, 10),
        parseInt(height, 10));
      this.canvasContext.strokeRect(parseInt(left, 10),
        parseInt(top, 10),
        parseInt(width, 10),
        parseInt(height, 10));
      this.canvasContext.fillRect(parseInt(left, 10),
        parseInt(top, 10),
        parseInt(width, 10),
        parseInt(height, 10));
    }
  }

  /**
   * Remove image at given index.
   * @param index the index in screenshot array.
   */
  public remove(index: number): void {
    this.screenshots.splice(index, 1);
    this.changeDetection.detectChanges();
  }

  /**
   * Remove the mouse drawing events.
   */
  private static removeMouseDrawingEvents(): void {
    document.removeEventListener("mousedown");
    document.removeEventListener("mouseup");
    document.removeEventListener("mousemove");
  }

  /**
   * Setup mouse drawing events.
   */
  private setupMouseDrawingEvents(): void {
    document.addEventListener("mousedown", (event: any) => {
      /* Make sure we don't execute when clicking on feedback buttons. */
      if (!event.target || !event.target.classList.contains(FEEDBACK_BTN_CLASS)) {
        this.startDrawing(event.pageX, event.pageY);
      }
    });
    document.addEventListener("mouseup", (event: any) => {
      /* Make sure we don't execute when clicking on feedback buttons. */
      if (!event.target || !event.target.classList.contains(FEEDBACK_BTN_CLASS)) {
        this.finishDrawing(event.pageX, event.pageY);
      }
    });
    document.addEventListener("mousemove", (event: any) => {
      this.adjustDrawing(event.pageX, event.pageY);
    });
  }

  /**
   * Start drawing from given position.
   * @param x the x-axis page position to start at.
   * @param y the y-axis page position to start at.
   */
  private startDrawing(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;

    this.canvasContext.beginPath();

    this.isDrawing = true;

    this.redraw();
  }

  /**
   * Capture a screenshot.
   */
  public takeScreenshot(): void {

    this.preRenderScrollPosition = window.pageYOffset;
    document.body.scrollTop = 0; // Scroll to the top.
    document.body.style["overflow"] = "hidden"; // Disable Scroll.
    document.body.classList.add("wait"); // Set cursor for body to wait.
    this.canvas.classList.add("wait"); // Set cursor for canvas to wait.

    this.feedback.lockTakeScreenshotButtons();
    FeedbackScreenshotComponent.removeMouseDrawingEvents();

    let options = {
      onrendered: (canvas: any) => this.processRenderedScreenshot(canvas)
    };

    /* Create a canvas from body, and create an image out of it. */
    html2canvas(document.body, options);
  }
}