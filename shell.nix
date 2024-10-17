# save this as shell.nix
{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  packages = [
    pkgs.nodejs_20
    pkgs.go_1_22
  ];
}
