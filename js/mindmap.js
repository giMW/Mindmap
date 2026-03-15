// In-memory tree model for the mind map

let _idCounter = 0;

function generateId() {
  return 'node_' + Date.now().toString(36) + '_' + (++_idCounter).toString(36);
}

/**
 * Create a new node.
 * @param {string} text
 * @param {Array} children
 * @returns {{ id: string, text: string, done: boolean, children: Array }}
 */
export function createNode(text = 'New Node', children = []) {
  return {
    id: generateId(),
    text,
    done: false,
    children: children.map(c => ({ ...c })),
  };
}

/**
 * Create a default root node with some starter children.
 */
export function createDefaultTree() {
  return createNode('My Mind Map', [
    createNode('Ideas', [
      createNode('Brainstorm'),
      createNode('Research'),
    ]),
    createNode('Tasks', [
      createNode('Urgent'),
      createNode('Later'),
    ]),
    createNode('Goals'),
  ]);
}

/**
 * Deep clone a tree.
 */
export function cloneTree(node) {
  return {
    id: node.id,
    text: node.text,
    done: node.done,
    children: node.children.map(c => cloneTree(c)),
  };
}

/**
 * Find a node by ID in the tree.
 * @returns {{ node, parent, index } | null}
 */
export function findNode(root, id) {
  if (root.id === id) {
    return { node: root, parent: null, index: -1 };
  }
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === id) {
      return { node: root.children[i], parent: root, index: i };
    }
    const found = findNode(root.children[i], id);
    if (found) return found;
  }
  return null;
}

/**
 * Add a child node to the node with the given parentId.
 * @returns the new child node, or null if parent not found
 */
export function addChild(root, parentId, text = 'New Node') {
  const result = findNode(root, parentId);
  if (!result) return null;
  const child = createNode(text);
  result.node.children.push(child);
  return child;
}

/**
 * Update the text of a node.
 */
export function updateNodeText(root, nodeId, newText) {
  const result = findNode(root, nodeId);
  if (!result) return false;
  result.node.text = newText;
  return true;
}

/**
 * Toggle the done state of a node.
 * When marking done, all descendants are also marked done.
 * When unmarking, all descendants are also unmarked.
 */
export function toggleDone(root, nodeId) {
  const result = findNode(root, nodeId);
  if (!result) return false;
  const newState = !result.node.done;
  setDoneRecursive(result.node, newState);
  return true;
}

function setDoneRecursive(node, done) {
  node.done = done;
  for (const child of node.children) {
    setDoneRecursive(child, done);
  }
}

/**
 * Move a node (and its subtree) to a new parent.
 * Cannot move root, cannot move to itself or its own descendant.
 */
export function moveNode(root, nodeId, newParentId) {
  if (nodeId === root.id || nodeId === newParentId) return false;

  const nodeResult = findNode(root, nodeId);
  if (!nodeResult || !nodeResult.parent) return false;

  // Prevent moving a node into its own subtree
  if (findNode(nodeResult.node, newParentId)) return false;

  const parentResult = findNode(root, newParentId);
  if (!parentResult) return false;

  // Remove from old parent
  nodeResult.parent.children.splice(nodeResult.index, 1);
  // Add to new parent
  parentResult.node.children.push(nodeResult.node);
  return true;
}

/**
 * Delete a node and its subtree. Cannot delete root.
 */
export function deleteNode(root, nodeId) {
  if (root.id === nodeId) return false; // Can't delete root
  const result = findNode(root, nodeId);
  if (!result || !result.parent) return false;
  result.parent.children.splice(result.index, 1);
  return true;
}

/**
 * Serialize tree to a plain object (for Firestore).
 */
export function serializeTree(node) {
  return {
    id: node.id,
    text: node.text,
    done: node.done,
    children: node.children.map(c => serializeTree(c)),
  };
}

/**
 * Deserialize a plain object back to a tree.
 */
export function deserializeTree(data) {
  if (!data) return createDefaultTree();
  return {
    id: data.id || generateId(),
    text: data.text || '',
    done: !!data.done,
    children: (data.children || []).map(c => deserializeTree(c)),
  };
}

/**
 * Get the depth of a node within the tree.
 */
export function getNodeDepth(root, nodeId, depth = 0) {
  if (root.id === nodeId) return depth;
  for (const child of root.children) {
    const d = getNodeDepth(child, nodeId, depth + 1);
    if (d !== -1) return d;
  }
  return -1;
}

/**
 * Get the branch index (which root-child this node belongs to).
 */
export function getBranchIndex(root, nodeId) {
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === nodeId) return i;
    const found = findNode(root.children[i], nodeId);
    if (found) return i;
  }
  return 0;
}
