/**
 * `cc` 的最小类型声明：只覆盖本工程用到的 API。
 *
 * 真正的类型由 Cocos Creator 安装后生成的 `temp/tsconfig.cocos.json` +
 * `cc.d.ts` 提供；本机没装 Creator，所以用这份手写声明让 `tsconfig.check.json`
 * 能独立跑 `tsc --noEmit`。它不改变 Creator 的编译（Creator 会忽略这里的声明，
 * 用自己生成的类型）。
 */
declare module 'cc' {
  export class Vec2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  export class Vec3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
  }

  export class Color {
    r: number;
    g: number;
    b: number;
    a: number;
    constructor(r?: number, g?: number, b?: number, a?: number);
  }

  export class Component {
    node: Node;
    isValid: boolean;
  }

  export class Node {
    constructor(name?: string);
    parent: Node | null;
    active: boolean;
    isValid: boolean;
    layer: number;
    children: Node[];
    setPosition(x: number, y: number, z?: number): void;
    setScale(x: number, y: number, z?: number): void;
    setSiblingIndex(index: number): void;
    getChildByName(name: string): Node | null;
    removeFromParent(): void;
    addComponent<T extends Component>(type: new (...args: never[]) => T): T;
    getComponent<T extends Component>(type: new (...args: never[]) => T): T | null;
    getComponentInChildren<T extends Component>(type: new (...args: never[]) => T): T | null;
    on(type: string, callback: (event: EventTouch) => void, target?: unknown): void;
    off(type: string, callback: (event: EventTouch) => void, target?: unknown): void;
    destroy(): void;
    static EventType: {
      TOUCH_END: string;
      TOUCH_START: string;
      TOUCH_MOVE: string;
    };
  }

  export class UITransform extends Component {
    setContentSize(width: number, height: number): void;
    setAnchorPoint(x: number, y: number): void;
    contentSize: { width: number; height: number };
    anchorPoint: { x: number; y: number };
    convertToNodeSpaceAR(worldPoint: Vec3): Vec3;
  }

  export class Graphics extends Component {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    clear(): void;
    rect(x: number, y: number, w: number, h: number): void;
    circle(x: number, y: number, r: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
    fill(): void;
    stroke(): void;
  }

  export class Label extends Component {
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    fontFamily: string;
    horizontalAlign: number;
    verticalAlign: number;
    overflow: number;
    static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
    static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
    static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
  }

  export class Asset {
    name: string;
  }

  export class SpriteFrame extends Asset {
    texture: Texture2D | null;
    constructor();
  }

  export class Texture2D extends Asset {
    image: ImageAsset | null;
    constructor();
  }

  export class ImageAsset extends Asset {}

  /** 音频片段：`resources.load('audio/sfx/hit01', AudioClip)` 拿到的就是这个 */
  export class AudioClip extends Asset {
    duration: number;
  }

  /**
   * 音频播放器。装配手册里 BGM/SFX 靠场景里一个常驻节点挂它，
   * 代码侧只需要 `source.playOneShot(clip)` / `source.play()`。
   */
  export class AudioSource extends Component {
    clip: AudioClip | null;
    loop: boolean;
    volume: number;
    playing: boolean;
    play(): void;
    pause(): void;
    stop(): void;
    playOneShot(clip: AudioClip, volumeScale?: number): void;
  }

  export class Sprite extends Component {
    spriteFrame: SpriteFrame | null;
    sizeMode: number;
    static SizeMode: { CUSTOM: number; TRIMMED: number; RAW: number };
  }

  export class EventTouch {
    getUILocation(): Vec2;
  }

  export class JsonAsset {
    json: unknown;
  }

  export const input: {
    on(type: string, callback: (event: EventTouch) => void, target?: unknown): void;
    off(type: string, callback: (event: EventTouch) => void, target?: unknown): void;
  };

  export const Input: {
    EventType: { TOUCH_END: string; TOUCH_START: string; TOUCH_MOVE: string };
  };

  /**
   * 节点掩码。`new Node()` 的 layer 默认是 DEFAULT（1<<30），而 Canvas 上相机的
   * visibility 只含 UI_2D（1<<25）—— 运行期建的节点必须显式设 `node.layer = Layers.Enum.UI_2D`，
   * 否则整屏只剩背景色（Graphics/Label 全被剔除）。四个 Root 的建节点辅助函数都做了这一步。
   */
  export const Layers: {
    Enum: { DEFAULT: number; UI_2D: number; UI_3D: number; IGNORE_RAYCAST: number };
  };

  export const resources: {
    load<T>(path: string, type: new (...args: never[]) => T, callback: (err: Error | null, asset: T | null) => void): void;
  };

  export const assetManager: {
    loadRemote<T>(url: string, callback: (err: Error | null, asset: T | null) => void): void;
  };

  export const director: {
    loadScene(name: string): void;
  };

  export const sys: {
    localStorage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
      removeItem(key: string): void;
    };
  };

  export const _decorator: {
    ccclass(name: string): ClassDecorator;
    property(options?: unknown): PropertyDecorator;
  };
}
