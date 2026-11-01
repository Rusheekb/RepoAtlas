import { Handle, Position, type NodeHandle } from '@xyflow/react'

/**
 * Edges in our graphs follow paths computed by our own layouts, so handles only exist to satisfy React Flow.
 * They sit at the node's center and are invisible and not connectable.
 */
export function HiddenHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="atlas-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="atlas-handle" isConnectable={false} />
    </>
  )
}

/** Matching handle bounds declared up front, so edges render before the DOM has been measured. */
export function centerHandles(width: number, height: number): NodeHandle[] {
  return [
    { type: 'target', position: Position.Left, x: width / 2, y: height / 2, width: 1, height: 1 },
    { type: 'source', position: Position.Right, x: width / 2, y: height / 2, width: 1, height: 1 },
  ]
}
