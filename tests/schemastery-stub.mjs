// 自测用的最小 schemastery 替身：宿主模块只在求值期调用 Schema.object/string，
// 校验与装配由宿主完成，这里无需真实语义。
class Field {
  constructor(kind) { this.kind = kind; this.defaultValue = undefined; this.descriptionText = ""; }
  default(value) { this.defaultValue = value; return this; }
  description(text) { this.descriptionText = text; return this; }
}

class ObjectSchema {
  constructor(shape) { this.shape = shape; }
  default(value) { this.defaultValue = value; return this; }
  description(text) { this.descriptionText = text; return this; }
}

const Schema = {
  string: () => new Field("string"),
  boolean: () => new Field("boolean"),
  number: () => new Field("number"),
  array: (item) => new Field("array"),
  object: (shape) => new ObjectSchema(shape),
};

export default Schema;
