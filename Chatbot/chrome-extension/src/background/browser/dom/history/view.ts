export class HashedDomElement {
  /**
   * Hash of the dom element to be used as a unique identifier
   */
  constructor(
    public branchPathHash: string,
    public attributesHash: string,
    public xpathHash: string,
    // textHash: string
  ) {}
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface CoordinateSet {
  topLeft: Coordinates;
  topRight: Coordinates;
  bottomLeft: Coordinates;
  bottomRight: Coordinates;
  center: Coordinates;
  width: number;
  height: number;
}

export interface ViewportInfo {
  scrollX: number | null;
  scrollY: number | null;
  width: number;
  height: number;
}

export interface DOMHistoryElementDict {
  tagName: string;
  xpath: string;
  highlightIndex: number | null;
  entireParentBranchPath: string[];
  attributes: Record<string, string>;
  shadowRoot: boolean;
  cssSelector: string | null;
  pageCoordinates: CoordinateSet | null;
  viewportCoordinates: CoordinateSet | null;
  viewportInfo: ViewportInfo | null;
}

export class DOMHistoryElement {
  constructor(
    public tagName: string,
    public xpath: string,
    public highlightIndex: number | null,
    public entireParentBranchPath: string[],
    public attributes: Record<string, string>,
    public shadowRoot = false,
    public cssSelector: string | null = null,
    public pageCoordinates: CoordinateSet | null = null,
    public viewportCoordinates: CoordinateSet | null = null,
    public viewportInfo: ViewportInfo | null = null,
  ) {}

  toDict(): DOMHistoryElementDict {
    return {
      tagName: this.tagName,
      xpath: this.xpath,
      highlightIndex: this.highlightIndex,
      entireParentBranchPath: this.entireParentBranchPath,
      attributes: this.attributes,
      shadowRoot: this.shadowRoot,
      cssSelector: this.cssSelector,
      pageCoordinates: this.pageCoordinates,
      viewportCoordinates: this.viewportCoordinates,
      viewportInfo: this.viewportInfo,
    };
  }
}
