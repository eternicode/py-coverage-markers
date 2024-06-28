# Change Log

All notable changes to the "py-coverage-markers" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.3] - 2024-06-28

### Fixed

- Fixed problem with uncovered files on one open tab preventing covered files in other open tabs from being updated
- Implemented exponential backoff for XML ingester; on large projects, coverage can take some time to populate the file after we see it change

## [0.0.2] - 2023-06-08

### Changed

- Tweaked how filenames are matched, allowing to ignore prefixes

## [0.0.1] - 2023-06-05

### Added

- Initial release
