// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.

// Interface definitions
interface AnimationSettings {
  style: string;
  typeBy: 'letter' | 'word';
  direction: 'forward' | 'backwards';
  duration: number;
}

interface ComponentData {
  text: string;
  layerName: string;
  animation: AnimationSettings;
}

interface SelectionData {
  type: string;
  name: string;
  content?: string;
}

// Define a type for plugin messages
interface PluginMessage {
  type: string;
  data?: unknown;
}

// Plugin initialization
function initPlugin() {
  console.log('Initializing plugin...');
  // Show the UI
  figma.showUI(__html__, { 
    width: 480, 
    height: 320,
    themeColors: true 
  });

  // Send initial selection to UI
  console.log('Sending initial selection...');
  sendSelectionToUI();

  // Listen for selection changes
  console.log('Setting up selection change listener...');
  figma.on('selectionchange', () => {
    sendSelectionToUI();
  });

  // Handle messages from UI
  figma.ui.onmessage = handleUIMessage;
}

if (figma.editorType === 'figma') {
  console.log('Editor type is figma, initializing...');
  initPlugin();
} else {
  console.log('Editor type is:', figma.editorType);
}

// function sendSelectionToUI() {
//   const selection = figma.currentPage.selection;
  
//   if (selection.length === 1 && selection[0].type === 'TEXT') {
//     const textNode = selection[0] as TextNode;
//     const selectionData: SelectionData = {
//       type: 'TEXT',
//       name: textNode.name,
//       content: textNode.characters
//     };
    
//     figma.ui.postMessage({
//       type: 'selection-changed',
//       data: selectionData
//     });
//   } else {
//     figma.ui.postMessage({
//       type: 'selection-changed',
//       data: null
//     });
//   }
// }

function sendSelectionToUI() {
  const selection = figma.currentPage.selection;
  
  console.log('Selection changed. Count:', selection.length);
  if (selection.length > 0) {
    console.log('Selected node type:', selection[0].type);
    console.log('Selected node name:', selection[0].name);
  }

  if (selection.length === 1 && selection[0].type === 'TEXT') {
    const textNode = selection[0] as TextNode;
    const selectionData: SelectionData = {
      type: 'TEXT',
      name: textNode.name,
      content: textNode.characters // This gets the actual text content
    };
    
    console.log('Sending text layer to UI:', selectionData);
    
    figma.ui.postMessage({
      type: 'selection-changed',
      data: selectionData
    });
  } else {
    console.log('No text layer selected, clearing selection');
    figma.ui.postMessage({
      type: 'selection-changed',
      data: null
    });
  }
}


// Use PluginMessage type for msg
async function handleUIMessage(msg: PluginMessage) {
  const { type, data } = msg;

  switch (type) {
    case 'get-selection':
      sendSelectionToUI();
      break;

    case 'create-component':
      await createAnimationComponent(data as ComponentData);
      break;

    case 'close':
      figma.closePlugin();
      break;
    
      case 'resize-window':
      if (typeof data === 'object' && data && 'height' in data) {
        const resizeData = data as { height: number; animate?: boolean; duration?: number };
        const { height, animate: _animate = false, duration: _duration = 200 } = resizeData;
        
        // Set reasonable constraints
        const constrainedHeight = Math.max(300, Math.min(800, height));
        
        // Figma's resize is automatically smooth, but we can control timing
        figma.ui.resize(480, constrainedHeight);
      }
      break;

    case 'clear-selection':
      // Clear Figma's selection
      figma.currentPage.selection = [];
      // Send updated selection to UI
      sendSelectionToUI();
      break;

    default:
      console.log('Unknown message type:', type);
  }
}

async function createAnimationComponent(data: ComponentData) {
  try {
    const { text, animation } = data;
    
    // Create variants as separate components first
    const variants = await createAnimationVariants(text, animation);
    // Combine as variants (component set)
    const componentSet = figma.combineAsVariants(variants, figma.currentPage);
    componentSet.name = `${text} Animation`;
    componentSet.x = figma.viewport.center.x;
    componentSet.y = figma.viewport.center.y;

    // Position variants
    positionVariants(Array.from(componentSet.children) as ComponentNode[]);

    // Select the component set
    figma.currentPage.selection = [componentSet];
    figma.viewport.scrollAndZoomIntoView([componentSet]);

    // Notify UI of success
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: true }
    });

  } catch (error) {
    console.error('Error creating component:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: false, error: errMsg }
    });
  }
}

// Remove componentSet param, return array of components
async function createAnimationVariants(
  text: string, 
  animation: AnimationSettings
): Promise<ComponentNode[]> {
  const variants: ComponentNode[] = [];
  const { style, typeBy, duration } = animation;

  // Determine number of frames based on animation type and duration
  const frameCount = calculateFrameCount(style, typeBy, duration, text.length);
  
  for (let i = 0; i < frameCount; i++) {
    const variant = figma.createComponent();
    variant.name = `State=${i + 1}`;
    // Create the text content for this frame
    const textNode = await createTextNodeForFrame(text, animation, i, frameCount);
    variant.appendChild(textNode);
    // Resize variant to fit content
    variant.resizeWithoutConstraints(
      Math.max(textNode.width + 20, 100),
      Math.max(textNode.height + 20, 50)
    );
    // Center text in variant
    textNode.x = (variant.width - textNode.width) / 2;
    textNode.y = (variant.height - textNode.height) / 2;
    variants.push(variant);
  }

  return variants;
}

function calculateFrameCount(
  style: string, 
  typeBy: 'letter' | 'word', 
  duration: number, 
  textLength: number
): number {
  switch (style) {
    case 'typing':
      return typeBy === 'letter' ? textLength + 1 : 2;
    case 'fade-in':
    case 'fade-out':
      return typeBy === 'letter' ? Math.min(textLength, 8) : 5;
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down':
      return typeBy === 'letter' ? Math.min(textLength, 6) : 4;
    case 'scale':
    case 'rotate':
      return typeBy === 'letter' ? Math.min(textLength, 6) : 4;
    default:
      return 3;
  }
}

async function createTextNodeForFrame(
  text: string, 
  animation: AnimationSettings, 
  frameIndex: number, 
  totalFrames: number
): Promise<TextNode> {
  const textNode = figma.createText();
  // Load default font
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const { style, typeBy, direction } = animation;
  const progress = frameIndex / (totalFrames - 1);
  // Apply animation logic based on style and frame
  switch (style) {
    case 'typing': {
      applyTypingEffect(textNode, text, typeBy, frameIndex, direction);
      break;
    }
    case 'fade-in': {
      textNode.characters = text;
      textNode.opacity = typeBy === 'letter' 
        ? applyLetterOpacity(text, frameIndex, totalFrames, direction)
        : Math.min(progress * 1.2, 1);
      break;
    }
    case 'fade-out': {
      textNode.characters = text;
      textNode.opacity = typeBy === 'letter'
        ? applyLetterOpacity(text, totalFrames - frameIndex - 1, totalFrames, direction)
        : Math.max(1 - progress * 1.2, 0);
      break;
    }
    case 'scale': {
      textNode.characters = text;
      const scale = typeBy === 'letter' 
        ? applyLetterScale(frameIndex, totalFrames)
        : Math.min(progress * 1.3, 1);
      textNode.resize(textNode.width * scale, textNode.height * scale);
      break;
    }
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down': {
      textNode.characters = text;
      applySlideEffect(textNode, style, progress, typeBy);
      break;
    }
    case 'rotate': {
      textNode.characters = text;
      // Note: Figma doesn't support rotation via API, so we'll simulate with scaling
      const rotateScale = typeBy === 'letter' 
        ? applyLetterScale(frameIndex, totalFrames)
        : Math.min(progress * 1.2, 1);
      textNode.resize(textNode.width * rotateScale, textNode.height * rotateScale);
      break;
    }
    default: {
      textNode.characters = text;
    }
  }
  // Set basic text properties
  textNode.fontSize = 16;
  textNode.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  return textNode;
}

function applyTypingEffect(
  textNode: TextNode, 
  text: string, 
  typeBy: 'letter' | 'word', 
  frameIndex: number,
  direction: 'forward' | 'backwards'
) {
  if (typeBy === 'letter') {
    const visibleLength = direction === 'forward' 
      ? frameIndex 
      : Math.max(0, text.length - frameIndex);
    textNode.characters = text.substring(0, visibleLength);
  } else {
    // Word-based typing
    const words = text.split(' ');
    if (frameIndex === 0) {
      textNode.characters = '';
    } else {
      const visibleWords = direction === 'forward' 
        ? words.slice(0, frameIndex)
        : words.slice(Math.max(0, words.length - frameIndex));
      textNode.characters = visibleWords.join(' ');
    }
  }
}

function applyLetterOpacity(
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  _direction: 'forward' | 'backwards'
): number {
  // For letter-based opacity, we'll simulate by showing/hiding characters
  // Since Figma doesn't support per-character opacity in text nodes
  const progress = frameIndex / (totalFrames - 1);
  const letterProgress = Math.min(progress * text.length, text.length);
  return letterProgress >= frameIndex ? 1 : 0.3;
}

function applyLetterScale(frameIndex: number, totalFrames: number): number {
  const progress = frameIndex / (totalFrames - 1);
  return Math.min(progress * 1.2, 1);
}

function applySlideEffect(
  textNode: TextNode, 
  style: string, 
  progress: number, 
  typeBy: 'letter' | 'word'
) {
  // Since Figma doesn't support transforms via API, we'll simulate with positioning
  // This will be represented by different character visibility patterns
  if (typeBy === 'letter') {
    // For letter-based sliding, we'll show letters progressively
    const text = textNode.characters;
    const visibleLength = Math.floor(progress * text.length);
    textNode.characters = text.substring(0, visibleLength);
  }
  // For word-based, the text remains the same as it's handled at component level
}

function positionVariants(variants: ComponentNode[]) {
  let xOffset = 0;
  const yPosition = 0;
  const spacing = 20;

  variants.forEach((variant) => {
    variant.x = xOffset;
    variant.y = yPosition;
    xOffset += variant.width + spacing;
  });
}

// Run the appropriate code based on editor type
if (figma.editorType === 'figma') {
  initPlugin();
}

if (figma.editorType === 'figjam') {
  // For FigJam, we'll use a simpler approach
  figma.showUI(__html__, { 
    width: 320, 
    height: 520 
  });

  figma.ui.onmessage = async (msg: PluginMessage) => {
    const { type, data } = msg;
    switch (type) {
      case 'get-selection': {
        // FigJam selection handling
        const selection = figma.currentPage.selection;
        if (selection.length === 1 && selection[0].type === 'TEXT') {
          const textNode = selection[0] as TextNode;
          figma.ui.postMessage({
            type: 'selection-changed',
            data: {
              type: 'TEXT',
              name: textNode.name,
              content: textNode.characters
            }
          });
        } else {
          figma.ui.postMessage({
            type: 'selection-changed',
            data: null
          });
        }
        break;
      }
      case 'create-component': {
        await createFigJamAnimation(data as ComponentData);
        break;
      }
      case 'close': {
        figma.closePlugin();
        break;
      }
    }
  };

  // Listen for selection changes in FigJam
  figma.on('selectionchange', () => {
    const selection = figma.currentPage.selection;
    if (selection.length === 1 && selection[0].type === 'TEXT') {
      const textNode = selection[0] as TextNode;
      figma.ui.postMessage({
        type: 'selection-changed',
        data: {
          type: 'TEXT',
          name: textNode.name,
          content: textNode.characters
        }
      });
    } else {
      figma.ui.postMessage({
        type: 'selection-changed',
        data: null
      });
    }
  });
}

if (figma.editorType === 'slides') {
  // For Slides, we'll create slide sequences
  figma.showUI(__html__, { 
    width: 320, 
    height: 520 
  });

  figma.ui.onmessage = async (msg: PluginMessage) => {
    const { type, data } = msg;
    switch (type) {
      case 'get-selection': {
        // Slides selection handling
        const selection = figma.currentPage.selection;
        if (selection.length === 1 && selection[0].type === 'TEXT') {
          const textNode = selection[0] as TextNode;
          figma.ui.postMessage({
            type: 'selection-changed',
            data: {
              type: 'TEXT',
              name: textNode.name,
              content: textNode.characters
            }
          });
        } else {
          figma.ui.postMessage({
            type: 'selection-changed',
            data: null
          });
        }
        break;
      }
      case 'create-component': {
        await createSlidesAnimation(data as ComponentData);
        break;
      }
      case 'close': {
        figma.closePlugin();
        break;
      }
    }
  };
}

async function createFigJamAnimation(data: ComponentData) {
  try {
    const { text, animation } = data;
    // Create shapes with text for each animation frame
    const shapes: SceneNode[] = [];
    const frameCount = calculateFrameCount(animation.style, animation.typeBy, animation.duration, text.length);
    for (let i = 0; i < frameCount; i++) {
      const shape = figma.createShapeWithText();
      shape.shapeType = 'ROUNDED_RECTANGLE';
      shape.name = `${text} - Frame ${i + 1}`;
      // Apply animation frame content
      const frameText = getFrameText(text, animation, i, frameCount);
      shape.text.characters = frameText;
      shape.text.fontSize = 16;
      shape.text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      // Position shapes horizontally
      shape.x = i * (shape.width + 50);
      shape.y = figma.viewport.center.y;
      // Set shape color based on frame
      const opacity = 1 - (i * 0.1);
      shape.fills = [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1 }, opacity: Math.max(opacity, 0.3) }];
      figma.currentPage.appendChild(shape);
      shapes.push(shape);
    }
    // Connect shapes with connectors to show sequence
    for (let i = 0; i < shapes.length - 1; i++) {
      const connector = figma.createConnector();
      connector.strokeWeight = 3;
      connector.strokes = [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1 } }];
      connector.connectorStart = {
        endpointNodeId: shapes[i].id,
        magnet: 'AUTO',
      };
      connector.connectorEnd = {
        endpointNodeId: shapes[i + 1].id,
        magnet: 'AUTO',
      };
    }
    // Select all created shapes
    figma.currentPage.selection = shapes;
    figma.viewport.scrollAndZoomIntoView(shapes);
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: true }
    });
  } catch (error) {
    console.error('Error creating FigJam animation:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: false, error: errMsg }
    });
  }
}

async function createSlidesAnimation(data: ComponentData) {
  try {
    const { text, animation } = data;
    // Create multiple slides for the animation sequence
    const slides: SlideNode[] = [];
    const frameCount = calculateFrameCount(animation.style, animation.typeBy, animation.duration, text.length);
    for (let i = 0; i < frameCount; i++) {
      const slide = figma.createSlide();
      slide.name = `${text} Animation - Step ${i + 1}`;
      // Create text node for this slide
      const textNode = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      const frameText = getFrameText(text, animation, i, frameCount);
      textNode.characters = frameText;
      textNode.fontSize = 24;
      textNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      // Center text on slide
      textNode.x = (slide.width - textNode.width) / 2;
      textNode.y = (slide.height - textNode.height) / 2;
      slide.appendChild(textNode);
      slides.push(slide);
    }
    // Switch to grid view to show all slides
    figma.viewport.slidesView = 'grid';
    figma.currentPage.selection = slides;
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: true }
    });
  } catch (error) {
    console.error('Error creating Slides animation:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: false, error: errMsg }
    });
  }
}

function getFrameText(
  text: string, 
  animation: AnimationSettings, 
  frameIndex: number, 
  totalFrames: number
): string {
  const { style, typeBy, direction } = animation;
  const progress = frameIndex / (totalFrames - 1);

  switch (style) {
    case 'typing':
      if (typeBy === 'letter') {
        const visibleLength = direction === 'forward' 
          ? frameIndex 
          : Math.max(0, text.length - frameIndex);
        return text.substring(0, visibleLength);
      } else {
        const words = text.split(' ');
        if (frameIndex === 0) return '';
        const visibleWords = direction === 'forward' 
          ? words.slice(0, frameIndex)
          : words.slice(Math.max(0, words.length - frameIndex));
        return visibleWords.join(' ');
      }
      
    case 'fade-in':
    case 'fade-out':
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down':
    case 'scale':
    case 'rotate':
      if (typeBy === 'letter') {
        const visibleLength = Math.floor(progress * text.length);
        return text.substring(0, visibleLength);
      } else {
        return text;
      }
      
    default:
      return text;
  }
}