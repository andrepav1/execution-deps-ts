import * as ts from 'typescript';

/**
 * @deprecated better ways to do this
 */
const getNodeName = (node: ts.Declaration | ts.Node): string | undefined => {
  if (ts.isClassDeclaration(node)) {
    return node.name.text;
  } else if (ts.isMethodDeclaration(node)) {
    return (ts.getNameOfDeclaration(node as ts.Declaration) as ts.Identifier)
      .text;
  } else if (ts.isFunctionDeclaration(node)) {
    return node.name.text;
  } else {
    return '';
  }
};

const isThisKeyword = (node: ts.Node) => {
  return node?.kind === ts.SyntaxKind.ThisKeyword;
};

const getTypeName = (node: ts.ParameterDeclaration) => {
  if (!node?.type) return;
  if (ts.isArrayTypeNode(node.type)) {
    return node.type.elementType.kind.toString();
  }
  if (!(node.type as ts.TypeReferenceNode)?.typeName) {
    return node.type.kind.toString();
  }
  return ts.idText(
    (node.type as ts.TypeReferenceNode).typeName as ts.Identifier
  );
};

export const TSUtil = {
  isThisKeyword,
  getNodeName,
  getTypeName,
};
