import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

// Define types for directives
interface DirectiveNode extends Node {
  type: 'containerDirective' | 'leafDirective' | 'textDirective';
  name: string;
  attributes?: Record<string, string>;
  children: Node[];
  data?: {
    hName?: string;
    hProperties?: Record<string, any>;
  };
}

export default function remarkHomebrewery() {
  return (tree: Node) => {
    visit(tree, (node) => {
      if (
        node.type === 'containerDirective' ||
        node.type === 'leafDirective' ||
        node.type === 'textDirective'
      ) {
        const dNode = node as DirectiveNode;
        const data = dNode.data || (dNode.data = {});
        const attributes = dNode.attributes || {};

        const name = dNode.name;

        // Custom mapping for block types
        if (['monster', 'npc', 'note', 'descriptive', 'class', 'spell', 'item'].includes(name)) {
            data.hName = 'div';
            let className = `hb-${name}`;

            // Handle args from preprocess (e.g. args="frame,wide")
            if (attributes.args) {
                const args = attributes.args.split(',').map(s => s.trim());
                args.forEach(arg => {
                   if (arg) className += ` hb-${name}-${arg}`;
                });
            }

            // Handle standard class attribute if present
            if (attributes.class) className += ' ' + attributes.class;

            // Remove class from attributes to avoid conflict or duplication if we set it manually
            const { class: _c, args: _a, ...otherAttributes } = attributes;

            data.hProperties = {
                className: className.trim().split(/\s+/),
                ...otherAttributes
            };
        }
      }
    });
  };
}
