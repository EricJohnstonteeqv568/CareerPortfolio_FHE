// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CareerPortfolio_FHE is SepoliaConfig {
    struct EncryptedProfile {
        euint32[] skills;          // Encrypted skill ratings
        euint32[] experienceYears; // Encrypted years of experience
        euint32 educationLevel;    // Encrypted education level
    }
    
    struct JobRequirement {
        euint32[] requiredSkills;
        euint32 minExperience;
        euint32 minEducation;
    }
    
    struct MatchResult {
        uint256 profileId;
        uint256 jobId;
        uint32 matchScore;
        bool isRevealed;
    }

    uint256 public profileCount;
    uint256 public jobCount;
    mapping(uint256 => EncryptedProfile) public employeeProfiles;
    mapping(uint256 => JobRequirement) public jobRequirements;
    mapping(uint256 => MatchResult) public matchResults;
    
    event ProfileCreated(uint256 indexed profileId);
    event JobPosted(uint256 indexed jobId);
    event MatchRequested(uint256 indexed profileId, uint256 jobId);
    event MatchCompleted(uint256 indexed resultId);
    
    modifier onlyProfileOwner(uint256 profileId) {
        _;
    }
    
    function createEncryptedProfile(
        euint32[] memory skills,
        euint32[] memory experienceYears,
        euint32 educationLevel
    ) public {
        require(skills.length == experienceYears.length, "Invalid input");
        
        profileCount += 1;
        uint256 newId = profileCount;
        
        employeeProfiles[newId] = EncryptedProfile({
            skills: skills,
            experienceYears: experienceYears,
            educationLevel: educationLevel
        });
        
        emit ProfileCreated(newId);
    }
    
    function postEncryptedJob(
        euint32[] memory requiredSkills,
        euint32 minExperience,
        euint32 minEducation
    ) public {
        jobCount += 1;
        uint256 newId = jobCount;
        
        jobRequirements[newId] = JobRequirement({
            requiredSkills: requiredSkills,
            minExperience: minExperience,
            minEducation: minEducation
        });
        
        emit JobPosted(newId);
    }
    
    function requestProfileMatch(uint256 profileId, uint256 jobId) public onlyProfileOwner(profileId) {
        EncryptedProfile storage profile = employeeProfiles[profileId];
        JobRequirement storage job = jobRequirements[jobId];
        
        require(profile.skills.length == job.requiredSkills.length, "Skill count mismatch");
        
        bytes32[] memory ciphertexts = new bytes32[](profile.skills.length * 2 + 2);
        
        // Profile data
        for (uint i = 0; i < profile.skills.length; i++) {
            ciphertexts[i*2] = FHE.toBytes32(profile.skills[i]);
            ciphertexts[i*2+1] = FHE.toBytes32(profile.experienceYears[i]);
        }
        
        // Job requirements
        ciphertexts[ciphertexts.length-2] = FHE.toBytes32(job.minExperience);
        ciphertexts[ciphertexts.length-1] = FHE.toBytes32(job.minEducation);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processMatch.selector);
        matchResults[reqId] = MatchResult({
            profileId: profileId,
            jobId: jobId,
            matchScore: 0,
            isRevealed: false
        });
        
        emit MatchRequested(profileId, jobId);
    }
    
    function processMatch(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 score = abi.decode(cleartexts, (uint32));
        
        matchResults[requestId] = MatchResult({
            profileId: matchResults[requestId].profileId,
            jobId: matchResults[requestId].jobId,
            matchScore: score,
            isRevealed: true
        });
        
        emit MatchCompleted(requestId);
    }
    
    function getMatchResult(uint256 resultId) public view returns (
        uint256 profileId,
        uint256 jobId,
        uint32 matchScore,
        bool isRevealed
    ) {
        MatchResult storage result = matchResults[resultId];
        return (
            result.profileId,
            result.jobId,
            result.matchScore,
            result.isRevealed
        );
    }
    
    function calculateSkillMatch(
        euint32[] memory profileSkills,
        euint32[] memory requiredSkills
    ) public pure returns (euint32) {
        require(profileSkills.length == requiredSkills.length, "Skill count mismatch");
        
        euint32 matchScore = FHE.asEuint32(0);
        
        for (uint i = 0; i < profileSkills.length; i++) {
            ebool hasSkill = FHE.gt(profileSkills[i], FHE.asEuint32(0));
            ebool meetsRequirement = FHE.gte(profileSkills[i], requiredSkills[i]);
            
            matchScore = FHE.add(
                matchScore,
                FHE.select(
                    meetsRequirement,
                    FHE.asEuint32(2),
                    FHE.select(
                        hasSkill,
                        FHE.asEuint32(1),
                        FHE.asEuint32(0)
                    )
                )
            );
        }
        
        return matchScore;
    }
    
    function calculateExperienceMatch(
        euint32 profileExperience,
        euint32 requiredExperience
    ) public pure returns (euint32) {
        return FHE.select(
            FHE.gte(profileExperience, requiredExperience),
            FHE.asEuint32(10),
            FHE.asEuint32(0)
        );
    }
    
    function calculateEducationMatch(
        euint32 profileEducation,
        euint32 requiredEducation
    ) public pure returns (euint32) {
        return FHE.select(
            FHE.gte(profileEducation, requiredEducation),
            FHE.asEuint32(5),
            FHE.asEuint32(0)
        );
    }
}