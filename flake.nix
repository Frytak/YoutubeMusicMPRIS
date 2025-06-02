{
    description = "YouTube Music MPRIS implementation";

    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

        flake-utils = {
            url = "github:numtide/flake-utils";
        };
    };

    outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
    let
        pkgs = nixpkgs.legacyPackages.${system};
        projectName = "youtube-music-mpris";
    in
    {
        devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
                nodejs
                pkg-config
                dbus
            ];

            shellHook = ''
                printf '\x1b[36m\x1b[1m\x1b[4mTime to develop ${projectName}!\x1b[0m\n\n'
            '';
        };

        packages.youtube-music-mpris-server = pkgs.buildNpmPackage {
            pname = "youtube-music-mpris-server";
            version = "0.1.0";

            src = ./server;

            npmDepsHash = "sha256-+pYeRPfSIPE1Ch2Y/6hJV/l1TaZ5W0vNHFZHw0ONnpk=";
        };
    });
}
