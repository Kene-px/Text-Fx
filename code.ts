// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.

// Interface definitions
interface AnimationSettings {
  style: string;
  typeBy: 'letter' | 'word';
  direction: 'forward' | 'backwards';
  duration: number;
  color: string;
}

// Helper function to convert hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Default to white if invalid hex
    return { r: 1, g: 1, b: 1 };
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
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

    // Position variants and resize component set to fit all variants
    const componentVariants = Array.from(componentSet.children) as ComponentNode[];
    positionVariants(componentVariants);
    resizeComponentSetToFitVariants(componentSet, componentVariants);

    // Add a small delay to ensure variants are properly set up after combining
    await new Promise(resolve => setTimeout(resolve, 100));

    // Setup simple prototyping interactions
    await setupSimplePrototyping(componentVariants, animation);

    // Mark component set as prototyped
    componentSet.setPluginData('isPrototyped', 'true');
    componentSet.setPluginData('prototypeTimestamp', Date.now().toString());

    // Select the component set
    figma.currentPage.selection = [componentSet];
    figma.viewport.scrollAndZoomIntoView([componentSet]);

    // Notify UI of success
    figma.ui.postMessage({
      type: 'component-created',
      data: { success: true, prototyped: true }
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
  const frameCount = calculateFrameCount(style, typeBy, duration, text);
  
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
  text: string
): number {
  switch (style) {
    case 'typing':
      return typeBy === 'letter' ? text.length + 1 : text.split(' ').length + 1;
    case 'fade-in':
    case 'fade-out':
      return typeBy === 'letter' ? text.length + 1 : text.split(' ').length + 1;
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down':
      return typeBy === 'letter' ? text.length + 1 : text.split(' ').length + 1;
    case 'scale':
    case 'scale-grow':
    case 'scale-shrink':
      return typeBy === 'letter' ? text.length + 1 : text.split(' ').length + 1;
    case 'rotate':
      return typeBy === 'letter' ? text.length + 1 : text.split(' ').length + 1;
    default:
      return text.split(' ').length + 1;
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
    case 'scale-grow': {
      textNode.characters = text;
      if (typeBy === 'word') {
        applyWordScaleGrowEffect(textNode, text, frameIndex, totalFrames, direction);
      } else {
        const scale = direction === 'forward' 
          ? Math.min(progress * 1.2, 1)
          : Math.max(1 - progress * 1.2, 0.1);
        textNode.opacity = Math.min(progress * 1.5, 1);
      }
      break;
    }
    case 'scale-shrink': {
      textNode.characters = text;
      if (typeBy === 'word') {
        applyWordScaleShrinkEffect(textNode, text, frameIndex, totalFrames, direction);
      } else {
        const scale = direction === 'forward' 
          ? Math.max(1 - progress * 1.2, 0.1)
          : Math.min(progress * 1.2, 1);
        textNode.opacity = Math.max(1 - progress * 1.2, 0.1);
      }
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
      if (typeBy === 'word') {
        applyWordRotateEffect(textNode, text, frameIndex, totalFrames, direction);
      } else {
        // Note: Figma doesn't support rotation via API, so we'll simulate with scaling and opacity
        const rotateScale = direction === 'forward'
          ? Math.min(progress * 1.2, 1)
          : Math.max(1 - progress * 1.2, 0.1);
        textNode.opacity = Math.min(progress * 1.5, 1);
      }
      break;
    }
    default: {
      textNode.characters = text;
    }
  }
  // Set basic text properties
  textNode.fontSize = 16;
  const textColor = hexToRgb(animation.color);
  textNode.fills = [{ type: 'SOLID', color: textColor }];
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

function applyWordScaleGrowEffect(
  textNode: TextNode, 
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  direction: 'forward' | 'backwards'
) {
  const words = text.split(' ');
  if (frameIndex === 0) {
    textNode.characters = '';
    textNode.opacity = 0;
  } else {
    const wordIndex = direction === 'forward' 
      ? Math.min(frameIndex - 1, words.length - 1)
      : Math.max(words.length - frameIndex, 0);
    
    const visibleWords = direction === 'forward' 
      ? words.slice(0, wordIndex + 1)
      : words.slice(wordIndex);
    
    textNode.characters = visibleWords.join(' ');
    textNode.opacity = 1;
  }
}

function applyWordScaleShrinkEffect(
  textNode: TextNode, 
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  direction: 'forward' | 'backwards'
) {
  const words = text.split(' ');
  if (frameIndex === totalFrames - 1) {
    textNode.characters = '';
    textNode.opacity = 0;
  } else {
    const remainingWords = direction === 'forward' 
      ? Math.max(words.length - frameIndex, 0)
      : Math.min(frameIndex + 1, words.length);
    
    const visibleWords = direction === 'forward' 
      ? words.slice(0, remainingWords)
      : words.slice(0, remainingWords);
    
    textNode.characters = visibleWords.join(' ');
    textNode.opacity = 1;
  }
}

function applyWordRotateEffect(
  textNode: TextNode, 
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  direction: 'forward' | 'backwards'
) {
  const words = text.split(' ');
  if (frameIndex === 0) {
    textNode.characters = '';
    textNode.opacity = 0;
  } else {
    const wordIndex = direction === 'forward' 
      ? Math.min(frameIndex - 1, words.length - 1)
      : Math.max(words.length - frameIndex, 0);
    
    const visibleWords = direction === 'forward' 
      ? words.slice(0, wordIndex + 1)
      : words.slice(wordIndex);
    
    textNode.characters = visibleWords.join(' ');
    textNode.opacity = 1;
  }
}

function positionVariants(variants: ComponentNode[]) {
  const xPosition = 0;
  let yOffset = 0;
  const spacing = 20;

  variants.forEach((variant) => {
    variant.x = xPosition;
    variant.y = yOffset;
    yOffset += variant.height + spacing;
  });
}

function resizeComponentSetToFitVariants(componentSet: ComponentSetNode, variants: ComponentNode[]) {
  if (variants.length === 0) return;

  // Calculate the bounding box that contains all variants
  let minX = Math.min(...variants.map(v => v.x));
  let minY = Math.min(...variants.map(v => v.y));
  let maxX = Math.max(...variants.map(v => v.x + v.width));
  let maxY = Math.max(...variants.map(v => v.y + v.height));

  // Add some padding around the variants
  const padding = 10;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  // Calculate the new dimensions
  const newWidth = maxX - minX;
  const newHeight = maxY - minY;

  // Adjust variant positions if minX or minY is negative
  if (minX < 0 || minY < 0) {
    const offsetX = Math.max(0, -minX);
    const offsetY = Math.max(0, -minY);
    
    variants.forEach((variant) => {
      variant.x += offsetX;
      variant.y += offsetY;
    });
    
    // Update bounds after repositioning
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
  }

  // Resize the component set to fit all variants
  componentSet.resizeWithoutConstraints(newWidth, newHeight);
}


async function setupSimplePrototyping(variants: ComponentNode[], animation: AnimationSettings) {
  try {
    if (variants.length < 2) {
      console.log('Need at least 2 variants for prototyping');
      return;
    }

    console.log(`Setting up simple prototyping for ${variants.length} variants`);
    
    // Create minimal reaction format
    for (let i = 0; i < variants.length; i++) {
      const currentVariant = variants[i];
      const nextVariant = variants[(i + 1) % variants.length];
      
      // Use the most minimal reaction format that Figma accepts
      const reaction: Reaction = {
        actions: [{
          type: 'NODE',
          destinationId: nextVariant.id,
          navigation: 'CHANGE_TO',
          transition: {
            type: 'DISSOLVE',
            duration: 0.1,
            easing: { type: 'LINEAR' }
          }
        }],
        trigger: {
          type: 'ON_CLICK'
        }
      };
      
      await currentVariant.setReactionsAsync([reaction]);
    }
    
    console.log('Simple prototyping setup complete');
    
  } catch (error) {
    console.warn('Simple prototyping setup failed:', error);
  }
}

async function setupPrototypingInteractions(variants: ComponentNode[], animationSettings: AnimationSettings) {
  console.log('setupPrototypingInteractions called with:', {
    variantCount: variants.length,
    animationSettings,
    variantNames: variants.map(v => v.name),
    variantIds: variants.map(v => v.id)
  });

  const { duration, style, direction } = animationSettings;
  
  // Calculate timing between frames
  const frameDelay = Math.max(duration * 1000 / variants.length, 300); // At least 300ms per frame
  
  // Determine transition type based on animation style
  const transitionType = style.includes('scale') || style === 'rotate' ? 'SMART_ANIMATE' : 'DISSOLVE';
  
  // Determine easing based on animation style
  const getEasing = (animStyle: string): { type: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' } => {
    switch (animStyle) {
      case 'scale-grow':
        return { type: 'EASE_OUT' };
      case 'scale-shrink':
        return { type: 'EASE_IN' };
      case 'typing':
        return { type: 'LINEAR' };
      case 'rotate':
        return { type: 'EASE_IN_AND_OUT' };
      default:
        return { type: 'EASE_OUT' };
    }
  };

  const easing = getEasing(style);
  
  try {
    // Set up chain of reactions between variants based on direction
    const frameOrder = direction === 'forward' 
      ? variants.map((_, i) => i)
      : variants.map((_, i) => variants.length - 1 - i);
    
    console.log(`Direction: ${direction}, Frame order: [${frameOrder.join(', ')}]`);
    
    // Set up chain of reactions between variants
    for (let i = 0; i < variants.length; i++) {
      const currentIndex = frameOrder[i];
      const nextIndex = frameOrder[(i + 1) % frameOrder.length];
      
      const currentVariant = variants[currentIndex];
      const nextVariant = variants[nextIndex];
      
      if (!currentVariant || !nextVariant) {
        console.error(`❌ Missing variant: currentVariant=${currentVariant}, nextVariant=${nextVariant}`);
        continue;
      }
      
      if (!currentVariant.id || !nextVariant.id) {
        console.error(`❌ Invalid variant IDs: current=${currentVariant.id}, next=${nextVariant.id}`);
        continue;
      }
      
      console.log(`Setting up reaction from variant ${currentIndex} (${currentVariant.name}) to ${nextIndex} (${nextVariant.name})`);
      
      // Create a reaction from current to next variant using simplified format
      const reaction: Reaction = {
        actions: [{
          type: 'NODE',
          destinationId: nextVariant.id,
          navigation: 'NAVIGATE',
          transition: {
            type: transitionType,
            duration: 0.3,
            easing: easing
          }
        }],
        trigger: {
          type: 'ON_CLICK'
        }
      };
      
      console.log(`Reaction details:`, {
        from: currentVariant.name,
        to: nextVariant.name,
        transitionType,
        frameDelay,
        easing
      });
      
      // Set the reaction on the current variant
      try {
        await currentVariant.setReactionsAsync([reaction]);
        console.log(`✅ Successfully set reaction on variant ${currentVariant.name}`);
      } catch (reactionError) {
        console.error(`❌ Failed to set reaction on variant ${currentVariant.name}:`, reactionError);
        throw reactionError;
      }
    }
    
    console.log(`Successfully set up prototyping chain for ${variants.length} variants`);
    
  } catch (error) {
    console.error('Failed to set up prototyping interactions:', error);
  }
}

async function activatePrototypeMode(componentSet: ComponentSetNode, variants: (ComponentNode | InstanceNode)[]) {
  try {
    // Store prototype data for reference
    componentSet.setPluginData('isPrototyped', 'true');
    componentSet.setPluginData('prototypeTimestamp', Date.now().toString());
    
    // Select the first variant to start the prototype
    const firstVariant = variants[0];
    if (firstVariant) {
      // Select the first variant and trigger a prototype interaction
      figma.currentPage.selection = [firstVariant];
      
      // Auto-start the animation by programmatically triggering the first interaction
      await triggerFirstInteraction(firstVariant);
      
      // Select the component set after a brief delay
      setTimeout(() => {
        figma.currentPage.selection = [componentSet];
        
        // Notify Figma to show prototype mode
        figma.ui.postMessage({
          type: 'prototype-ready',
          data: { componentId: componentSet.id, startVariantId: firstVariant.id }
        });
      }, 200);
    }
    
    console.log('Prototype mode activated and animation started for component:', componentSet.name);
    
  } catch (error) {
    console.warn('Failed to activate prototype mode:', error);
  }
}

async function triggerFirstInteraction(firstVariant: ComponentNode | InstanceNode) {
  try {
    // Get the reactions from the first variant
    const reactions = firstVariant.reactions;
    
    if (reactions.length > 0) {
      // The interactions are set up with AFTER_TIMEOUT triggers, 
      // so the animation will start automatically when the prototype is viewed
      console.log('First variant has reactions set up, animation will auto-start');
      
      // We can also create an immediate trigger by adding a click interaction
      // that starts the sequence right away
      const immediateReaction: Reaction = {
        actions: reactions[0].actions, // Use the same action as the timeout
        trigger: {
          type: 'ON_CLICK' // Immediate trigger on click
        }
      };
      
      // Add both the timeout and click reactions
      await firstVariant.setReactionsAsync([...reactions, immediateReaction]);
    }
    
  } catch (error) {
    console.warn('Failed to set up immediate trigger:', error);
  }
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
    const frameCount = calculateFrameCount(animation.style, animation.typeBy, animation.duration, text);
    for (let i = 0; i < frameCount; i++) {
      const shape = figma.createShapeWithText();
      shape.shapeType = 'ROUNDED_RECTANGLE';
      shape.name = `${text} - Frame ${i + 1}`;
      // Apply animation frame content
      const frameText = getFrameText(text, animation, i, frameCount);
      shape.text.characters = frameText;
      shape.text.fontSize = 16;
      const textColor = hexToRgb(animation.color);
      shape.text.fills = [{ type: 'SOLID', color: textColor }];
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
    const frameCount = calculateFrameCount(animation.style, animation.typeBy, animation.duration, text);
    for (let i = 0; i < frameCount; i++) {
      const slide = figma.createSlide();
      slide.name = `${text} Animation - Step ${i + 1}`;
      // Create text node for this slide
      const textNode = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      const frameText = getFrameText(text, animation, i, frameCount);
      textNode.characters = frameText;
      textNode.fontSize = 24;
      const textColor = hexToRgb(animation.color);
      textNode.fills = [{ type: 'SOLID', color: textColor }];
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
      if (typeBy === 'letter') {
        const visibleLength = Math.floor(progress * text.length);
        return text.substring(0, visibleLength);
      } else {
        return text;
      }
      
    case 'scale-grow':
    case 'scale-shrink':
      if (typeBy === 'word') {
        const words = text.split(' ');
        if (frameIndex === 0) return '';
        const wordIndex = Math.min(frameIndex - 1, words.length - 1);
        return words.slice(0, wordIndex + 1).join(' ');
      } else {
        return text;
      }
      
    case 'rotate':
      if (typeBy === 'word') {
        const words = text.split(' ');
        if (frameIndex === 0) return '';
        const wordIndex = Math.min(frameIndex - 1, words.length - 1);
        return words.slice(0, wordIndex + 1).join(' ');
      } else {
        const visibleLength = Math.floor(progress * text.length);
        return text.substring(0, visibleLength);
      }
      
    default:
      return text;
  }
}