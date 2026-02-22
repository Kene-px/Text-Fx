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
    console.log(`🐛 DEBUG createAnimationComponent: text="${text}", animation=`, animation);
    
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
      // Scale animations only need 2 states: start and end
      return 2;
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
      const baseFontSize = 16;
      // Map direction to scale type: forward = grow, backwards = shrink
      const isGrow = direction === 'forward';

      // Scale animation has only 2 states: start (frameIndex=0) and end (frameIndex=1)
      // For grow: start = invisible/small, end = visible/normal
      // For shrink: start = visible/normal, end = invisible/small

      if (isGrow) {
        // Scale grow: nothing → full view
        if (frameIndex === 0) {
          // Start state: invisible
          textNode.opacity = 0;
          textNode.fontSize = 1; // Minimum font size
        } else {
          // End state: fully visible
          textNode.opacity = 1;
          textNode.fontSize = baseFontSize;
        }
      } else {
        // Scale shrink: full view → nothing
        if (frameIndex === 0) {
          // Start state: fully visible
          textNode.opacity = 1;
          textNode.fontSize = baseFontSize;
        } else {
          // End state: invisible
          textNode.opacity = 0;
          textNode.fontSize = 1; // Minimum font size
        }
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
      if (typeBy === 'word') {
        applyWordRotateEffect(textNode, text, frameIndex, totalFrames, direction);
      } else {
        // Note: Figma doesn't support rotation via API, so we'll simulate different rotation directions
        // using character revelation patterns and scaling
        applyLetterRotateEffect(textNode, text, frameIndex, totalFrames, direction);
      }
      break;
    }
    default: {
      textNode.characters = text;
    }
  }
  // Set basic text properties
  // Only set default fontSize if it's not a scale or rotate animation (they set their own fontSize)
  if (style !== 'scale' && style !== 'rotate') {
    textNode.fontSize = 16;
  }
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
    if (direction === 'forward') {
      // Forward: reveal letters left to right
      textNode.characters = text.substring(0, frameIndex);
    } else {
      // Backward: reveal letters right to left, building from the end
      const visibleLength = frameIndex;
      if (visibleLength === 0) {
        textNode.characters = '';
      } else {
        // Show the rightmost 'visibleLength' characters
        const startIndex = Math.max(0, text.length - visibleLength);
        textNode.characters = text.substring(startIndex);
      }
    }
  } else {
    // Word-based typing
    const words = text.split(' ');
    if (frameIndex === 0) {
      textNode.characters = '';
    } else {
      if (direction === 'forward') {
        // Forward: show words left to right
        const visibleWords = words.slice(0, frameIndex);
        textNode.characters = visibleWords.join(' ');
      } else {
        // Backward: reveal words right to left, starting from the last word
        const wordsToShow = frameIndex;
        const totalWords = words.length;
        
        // Show only the rightmost 'wordsToShow' words in their correct order
        const startWordIndex = Math.max(0, totalWords - wordsToShow);
        const visibleWords = words.slice(startWordIndex);
        textNode.characters = visibleWords.join(' ');
      }
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
    
    // Ensure proper spacing between words
    textNode.characters = visibleWords.join(' ');
    textNode.opacity = 1;
    
    console.log(`🐛 DEBUG applyWordScaleGrowEffect: frameIndex=${frameIndex}, wordIndex=${wordIndex}, visibleWords=[${visibleWords.join(', ')}], result="${textNode.characters}"`);
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
    // For shrink: start with all words, then remove from the end (right to left)
    // Each frame removes more words from the end
    const wordsToRemove = frameIndex;
    const remainingWords = Math.max(words.length - wordsToRemove, 0);
    
    const visibleWords = words.slice(0, remainingWords);
    
    textNode.characters = visibleWords.join(' ');
    textNode.opacity = 1;
    
    console.log(`🐛 DEBUG applyWordScaleShrinkEffect: frameIndex=${frameIndex}, wordsToRemove=${wordsToRemove}, remainingWords=${remainingWords}, visibleWords=[${visibleWords.join(', ')}], result="${textNode.characters}"`);
  }
}

function applyLetterRotateEffect(
  textNode: TextNode, 
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  direction: 'forward' | 'backwards'
) {
  const progress = frameIndex / (totalFrames - 1);
  
  // Keep consistent font size (no scaling like scale animation)
  textNode.fontSize = 16;
  
  if (direction === 'forward') {
    // Forward rotation: simulate clockwise spiral - characters appear in a circular pattern
    // Instead of straight left-to-right, use a pattern that simulates rotation
    if (progress < 0.5) {
      // First half: characters appear from center outward in alternating pattern
      const visibleCount = Math.floor(progress * 2 * text.length);
      const centerIndex = Math.floor(text.length / 2);
      let visibleText = '';
      
      for (let i = 0; i < text.length; i++) {
        const distanceFromCenter = Math.abs(i - centerIndex);
        const shouldShow = distanceFromCenter * 2 <= visibleCount;
        visibleText += shouldShow ? text[i] : ' ';
      }
      textNode.characters = visibleText;
      textNode.opacity = 0.3 + (progress * 1.4);
    } else {
      // Second half: fill in remaining characters to complete rotation
      const fillProgress = (progress - 0.5) * 2;
      const totalVisible = Math.floor(0.5 * text.length + fillProgress * 0.5 * text.length);
      
      let visibleText = '';
      for (let i = 0; i < text.length; i++) {
        const position = (i + Math.floor(text.length / 2)) % text.length;
        const shouldShow = position < totalVisible;
        visibleText += shouldShow ? text[i] : ' ';
      }
      textNode.characters = visibleText;
      textNode.opacity = Math.min(1, 0.8 + fillProgress * 0.4);
    }
  } else {
    // Backwards rotation: simulate counter-clockwise spiral - characters disappear in circular pattern
    const reverseProgress = 1 - progress;
    
    if (reverseProgress > 0.5) {
      // First half: normal text
      textNode.characters = text;
      textNode.opacity = reverseProgress;
    } else {
      // Second half: characters disappear in spiral pattern
      const fadeProgress = reverseProgress * 2;
      const centerIndex = Math.floor(text.length / 2);
      let visibleText = '';
      
      for (let i = 0; i < text.length; i++) {
        const distanceFromCenter = Math.abs(i - centerIndex);
        const shouldShow = distanceFromCenter * 2 <= fadeProgress * text.length;
        visibleText += shouldShow ? text[i] : ' ';
      }
      textNode.characters = visibleText;
      textNode.opacity = Math.max(0.2, fadeProgress);
    }
  }
}

function applyWordRotateEffect(
  textNode: TextNode, 
  text: string, 
  frameIndex: number, 
  totalFrames: number, 
  direction: 'forward' | 'backwards'
) {
  const progress = frameIndex / (totalFrames - 1);
  const words = text.split(' ');
  
  // Keep consistent font size (no scaling like scale animation)
  textNode.fontSize = 16;
  
  if (direction === 'forward') {
    // Forward rotation: words appear in a spiral pattern (clockwise)
    // Simulate rotation by showing words in a circular pattern, not linear
    if (progress < 0.3) {
      // Phase 1: Center word appears first
      const centerIndex = Math.floor(words.length / 2);
      const visibleWords = words.map((word, index) => {
        return index === centerIndex ? word : '';
      });
      textNode.characters = visibleWords.join(' ').trim();
      textNode.opacity = 0.4 + (progress * 2);
    } else if (progress < 0.7) {
      // Phase 2: Words spiral outward from center (alternating pattern)
      const spiralProgress = (progress - 0.3) / 0.4;
      const maxDistance = Math.floor(words.length / 2);
      const currentDistance = Math.floor(spiralProgress * maxDistance);
      const centerIndex = Math.floor(words.length / 2);
      
      const visibleWords = words.map((word, index) => {
        const distance = Math.abs(index - centerIndex);
        return distance <= currentDistance ? word : '';
      });
      textNode.characters = visibleWords.join(' ').trim();
      textNode.opacity = 0.6 + (spiralProgress * 0.3);
    } else {
      // Phase 3: Complete the rotation - show all words
      textNode.characters = text;
      textNode.opacity = Math.min(1, 0.9 + ((progress - 0.7) * 2));
    }
  } else {
    // Backwards rotation: words disappear in spiral pattern (counter-clockwise)
    const reverseProgress = 1 - progress;
    
    if (reverseProgress > 0.7) {
      // Phase 1: All words visible
      textNode.characters = text;
      textNode.opacity = reverseProgress + 0.1;
    } else if (reverseProgress > 0.3) {
      // Phase 2: Words disappear spiraling inward to center
      const spiralProgress = (reverseProgress - 0.3) / 0.4;
      const maxDistance = Math.floor(words.length / 2);
      const keepDistance = Math.floor(spiralProgress * maxDistance);
      const centerIndex = Math.floor(words.length / 2);
      
      const visibleWords = words.map((word, index) => {
        const distance = Math.abs(index - centerIndex);
        return distance <= keepDistance ? word : '';
      });
      textNode.characters = visibleWords.join(' ').trim();
      textNode.opacity = Math.max(0.3, spiralProgress * 1.2);
    } else {
      // Phase 3: Only center word remains, then disappears
      const finalProgress = reverseProgress / 0.3;
      if (finalProgress > 0.5 && words.length > 0) {
        const centerWord = words[Math.floor(words.length / 2)];
        textNode.characters = centerWord;
        textNode.opacity = finalProgress;
      } else {
        textNode.characters = '';
        textNode.opacity = 0;
      }
    }
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

    // Calculate timing to ensure total animation duration matches user's set duration
    // Total duration = sum of all (timeout + transition duration) across all frames
    const totalDuration = animation.duration; // in milliseconds
    const numTransitions = variants.length; // number of transitions (looping)

    // Time budget per transition (in milliseconds)
    const timePerTransition = totalDuration / numTransitions;

    console.log(`🐛 DEBUG setupSimplePrototyping: totalDuration=${totalDuration}ms, numTransitions=${numTransitions}, timePerTransition=${timePerTransition}ms`);
    
    // Create minimal reaction format
    const isScaleAnimation = animation.style === 'scale';
    const isTypingAnimation = animation.style === 'typing';

    for (let i = 0; i < variants.length; i++) {
      const currentVariant = variants[i];
      const isLastVariant = i === variants.length - 1;

      // For scale animations, don't set a reaction on the last variant (no looping)
      if (isScaleAnimation && isLastVariant) {
        console.log(`🐛 DEBUG setupSimplePrototyping: Skipping last variant for scale (no loop)`);
        continue;
      }

      const nextVariant = variants[(i + 1) % variants.length];

      // Calculate timeout and transition duration based on animation style
      // to ensure total duration matches user's set duration
      let timeout: number; // in seconds
      let transition: Transition | null;

      if (isScaleAnimation) {
        // Scale: transition duration IS the animation duration
        timeout = 0.01; // minimal delay before transition starts
        transition = {
          type: 'SMART_ANIMATE',
          duration: totalDuration / 1000, // full duration for the scale transition
          easing: { type: 'EASE_OUT' }
        };
      } else if (isTypingAnimation) {
        // Typing: instant transition, timeout creates the timing
        // Total time per frame = timeout only (no transition duration)
        timeout = timePerTransition / 1000;
        transition = null;
      } else {
        // Dissolve animations: timeout + transition duration = time per transition
        // Allocate 80% to timeout, 20% to transition (min 50ms transition)
        const transitionDuration = Math.max(timePerTransition * 0.2, 50) / 1000; // in seconds
        timeout = Math.max((timePerTransition / 1000) - transitionDuration, 0.01);
        transition = {
          type: 'DISSOLVE',
          duration: transitionDuration,
          easing: { type: 'LINEAR' }
        };
      }

      const reaction: Reaction = {
        actions: [{
          type: 'NODE',
          destinationId: nextVariant.id,
          navigation: 'CHANGE_TO',
          transition: transition
        }],
        trigger: {
          type: 'AFTER_TIMEOUT',
          timeout: timeout
        }
      };

      console.log(`🐛 DEBUG setupSimplePrototyping: Setting timeout=${timeout}s, transition=${transition ? transition.type : 'instant'} for variant ${i} (${currentVariant.name} -> ${nextVariant.name})`);

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
  const frameDelay = Math.max(duration / variants.length, 300); // At least 300ms per frame
  
  // Determine transition type based on animation style
  const transitionType = style.includes('scale') || style === 'rotate' ? 'SMART_ANIMATE' : 'DISSOLVE';
  
  // Determine easing based on animation style
  const getEasing = (animStyle: string): { type: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' } => {
    switch (animStyle) {
      case 'scale':
        return { type: 'EASE_OUT' };
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
          type: 'AFTER_TIMEOUT',
          timeout: frameDelay / 1000  // Convert milliseconds to seconds for Figma API
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
          type: 'AFTER_TIMEOUT',
          timeout: 0
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
      
    case 'scale':
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
        
        if (direction === 'forward') {
          // Forward: words appear left-to-right
          const wordIndex = Math.min(frameIndex - 1, words.length - 1);
          const visibleWords = words.slice(0, wordIndex + 1);
          return visibleWords.join(' ');
        } else {
          // Backwards: words appear from right to left, but in correct order
          const totalVisibleWords = Math.min(frameIndex, words.length);
          
          // Determine which words should be visible (from right to left)
          const visibleWordIndices = new Set<number>();
          for (let i = 0; i < totalVisibleWords; i++) {
            const wordIndex = words.length - 1 - i; // Start from rightmost
            visibleWordIndices.add(wordIndex);
          }
          
          // Build text in original order, but only include visible words
          const visibleWords: string[] = [];
          for (let i = 0; i < words.length; i++) {
            if (visibleWordIndices.has(i)) {
              visibleWords.push(words[i]);
            }
          }
          
          return visibleWords.join(' ');
        }
      } else {
        // For letter-based rotation, create different character patterns for forward/backward
        if (direction === 'forward') {
          // Forward: characters appear left-to-right (clockwise)
          const visibleLength = Math.floor(progress * text.length);
          return text.substring(0, visibleLength);
        } else {
          // Backwards: characters appear right-to-left (anti-clockwise)  
          const visibleLength = Math.floor(progress * text.length);
          if (visibleLength === 0) {
            return '';
          } else {
            const startIndex = text.length - visibleLength;
            return text.substring(startIndex);
          }
        }
      }
      
    default:
      return text;
  }
}