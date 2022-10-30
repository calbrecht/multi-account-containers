const {expect, initializeWithTab} = require("../common");

describe("SiteStoreKey Feature", function () {
  beforeEach(async function () {
    this.webExt = await initializeWithTab();
    this.storageArea = this.webExt.background.window.assignManager.storageArea;

    this.storageArea.sitekeyPatterns = [];

    this.expectSiteStoreKey = (url, expected) =>
      expect(this.storageArea.getSiteStoreKey(url)).to.equal(expected);
  });

  afterEach(function () {
    delete this.expectSiteStoreKey;
    delete this.storageArea;
    this.webExt.destroy();
  });

  it("should be the hostname by default", function () {
    this.expectSiteStoreKey(
      "https://www.example.com",
      "siteContainerMap@@_www.example.com"
    );
  });

  it("should match the most specific pattern regardless of order", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<least_specific>.)")],
    }, {
      hostname: [new RegExp("(?<more_specific>.)")],
      pathname: [new RegExp(".")],
    }, {
      hostname: [new RegExp("(?<most_specific>.)")],
      pathname: [new RegExp(".")],
      search: [new RegExp(".")],
    }, {
      hostname: [new RegExp("(?<more_specific>.)")],
      pathname: [new RegExp(".")],
    }, {
      hostname: [new RegExp("(?<least_specific>.)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_most_specific"
    );
  });

  it("should match the hostname pattern if more specific pattern do not match", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_match>.)")]
    }, {
      hostname: [new RegExp("(?<path_match>.)")],
      pathname: [new RegExp("^$")],
    }, {
      hostname: [new RegExp("(?<search_match>.)")],
      pathname: [new RegExp(".")],
      search: [new RegExp("^$")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_host_match"
    );
  });

  it("should match the pathname pattern if more specific pattern do not match", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_match>.)")],
    }, {
      hostname: [new RegExp("(?<path_match>.)")],
      pathname: [new RegExp(".")],
    }, {
      hostname: [new RegExp("(?<search_match>.)")],
      pathname: [new RegExp(".")],
      search: [new RegExp("^$")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_path_match"
    );
  });

  it("should include keys from all matching patterns in same specificity", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_one>.)")],
      pathname: [new RegExp("(?<path_one>.)")],
      search: [new RegExp("(?<search_one>.)")],
    }, {
      hostname: [new RegExp("(?<host_two>.)")],
      pathname: [new RegExp("(?<path_two>.)")],
      search: [new RegExp("(?<search_two>.)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_host_one,host_two,path_one,path_two,search_one,search_two"
    );
  });

  it("should include keys from all matching groups in same pattern", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_one>.)"), new RegExp("(?<host_two>.)")],
      pathname: [new RegExp("(?<path_one>.)"), new RegExp("(?<path_two>.)")],
      search: [new RegExp("(?<search_one>.)"), new RegExp("(?<search_two>.)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_host_one,host_two,path_one,path_two,search_one,search_two"
    );
  });

  it("should have unique keys from all matches", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<one>.)"), new RegExp("(?<two>.)")],
      pathname: [new RegExp("(?<one>.)"), new RegExp("(?<two>.)")],
      search: [new RegExp("(?<one>.)"), new RegExp("(?<two>.)")],
    }, {
      hostname: [new RegExp("(?<one>.)"), new RegExp("(?<one>.)")],
      pathname: [new RegExp("(?<one>.)"), new RegExp("(?<one>.)")],
      search: [new RegExp("(?<one>.)"), new RegExp("(?<one>.)")],
    }, {
      hostname: [new RegExp("(?<two>.)"), new RegExp("(?<two>.)")],
      pathname: [new RegExp("(?<two>.)"), new RegExp("(?<two>.)")],
      search: [new RegExp("(?<two>.)"), new RegExp("(?<two>.)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_one,two"
    );
  });

  it("should ignore non matching groups within same pattern", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_one>.)"), new RegExp("(?<host_none>^$)")],
      pathname: [new RegExp("(?<path_one>.)"), new RegExp("(?<path_none>^$)")],
      search: [new RegExp("(?<search_one>.)"), new RegExp("(?<search_none>^$)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_host_one,path_one,search_one"
    );
  });

  it("should fallback to hostname if no patterns match", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp("(?<host_none>^$)")],
      pathname: [new RegExp("(?<path_none>^$)")],
      search: [new RegExp("(?<search_none>^$)")],
    }, {
      hostname: [new RegExp("(?<host_none>^$)")],
      pathname: [new RegExp("(?<path_none>^$)")],
    }, {
      hostname: [new RegExp("(?<host_none>^$)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_www.example.com"
    );
  });

  it("should fallback to hostname if no groups found in matching patterns", function () {
    this.storageArea.sitekeyPatterns = [{
      hostname: [new RegExp(".")],
      pathname: [new RegExp(".")],
      search: [new RegExp(".")],
    }, {
      hostname: [new RegExp(".")],
      pathname: [new RegExp(".")],
    }, {
      hostname: [new RegExp(".")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_www.example.com"
    );
  });

  it("should not match if less specific url part matchers are missing", function () {
    this.storageArea.sitekeyPatterns = [{
      pathname: [new RegExp("(?<path>.)")],
    }, {
      pathname: [new RegExp("(?<path>.)")],
      search: [new RegExp("(?<search>.)")],
    }, {
      search: [new RegExp("(?<search>.)")],
    }];

    this.expectSiteStoreKey(
      "https://www.example.com/path/to?some=param&and=more",
      "siteContainerMap@@_www.example.com"
    );
  });

});
