// server/sessionMemory.js
let currentUser = null;

function setUser(user) {
  currentUser = user;
}

function getUser() {
  return currentUser;
}

module.exports = {
  setUser,
  getUser,
};
