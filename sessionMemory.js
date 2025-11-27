let user = null;

function setUser(u) {
  user = u;
}

function getUser() {
  return user;
}

module.exports = { setUser, getUser };
