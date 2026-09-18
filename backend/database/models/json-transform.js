// @file backend/database/models/json-transform.js
// Shared `toJSON` options: expose `id`, hide `_id`/`__v`. Clients never see Mongo internals.
export const jsonTransform = {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
};
