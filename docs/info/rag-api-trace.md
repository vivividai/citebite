# RAG API Trace Log

Generated: 2025-12-02T06:28:44.063Z

---

## 1. RAG Query Input

```json
{
  "collectionId": "20584ca6-52e8-4a6d-b432-05a6cea33131",
  "query": "tell me about mram development",
  "conversationHistoryLength": 0,
  "conversationHistory": [],
  "timestamp": "2025-12-02T06:28:44.066Z"
}
```

## 2. Hybrid Search Results

```json
{
  "totalChunks": 20,
  "chunks": [
    {
      "index": 0,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "78ae7315-9a56-4886-b999-eba43b8280dd",
      "chunkIndex": 20,
      "semanticScore": 0.719160536009241,
      "keywordScore": 0,
      "combinedScore": 0.0114754098360656,
      "contentPreview": "players, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT). Notably,\nEverspin introduced a 3rd generation standalone 256Mb STT-\nMRAM (pMTJ) and a 1Gb STT-MRAM. ...",
      "contentLength": 961
    },
    {
      "index": 1,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "20d93d1a-2d99-43de-94fa-a8c44be87221",
      "chunkIndex": 11,
      "semanticScore": 0.70995595787675,
      "keywordScore": 0,
      "combinedScore": 0.0112903225806452,
      "contentPreview": "STT-MRAM (spin-transfer torque magnetic\nRandom Access Memory), PCRAM (phase-change RAM),\nand ReRAM (resistive RAM), among others, are pursued to\nfulfill some of these characteristics [12], [13], [14]. These\nNVMs share common features as nonvolatile two-terminal\ndevices, distinguishing states through...",
      "contentLength": 850
    },
    {
      "index": 2,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "chunkId": "d16048ac-ae1a-4d4d-b48c-603b69f2504b",
      "chunkIndex": 6,
      "semanticScore": 0.708961532625379,
      "keywordScore": 0,
      "combinedScore": 0.0111111111111111,
      "contentPreview": "e performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM. Large write delay (> ns\nrange) resulting from spin injection symmetry in switching\nthe magnetic ori...",
      "contentLength": 974
    },
    {
      "index": 3,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "chunkId": "a9dc7983-f978-47cf-bc11-a5992c3d3c16",
      "chunkIndex": 5,
      "semanticScore": 0.708288247487902,
      "keywordScore": 0,
      "combinedScore": 0.0109375,
      "contentPreview": "against radiation-induced soft errors,\nand CMOS compatibility of emerging Spin-based non-volatile\n(NVM) magnetic memory (i.e., MRAM) technologies, attracted\nresearchers from academia and industry [7]. Spin Transfer\nTorque (STT) MRAM, has already shifted its gear from\nthe R&D phase to commercializati...",
      "contentLength": 925
    },
    {
      "index": 4,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "3b234222-d7df-4186-a48e-92a7307f593e",
      "chunkIndex": 77,
      "semanticScore": 0.697708560616181,
      "keywordScore": 0,
      "combinedScore": 0.0107692307692308,
      "contentPreview": "ation in both RAM and ROM modes. Conversely, R-\nMRAM merges ROM with STT-MRAM, using an additional\nBit Line (BL) for ROM data. While supporting RAM and ROM\nmodes, R-MRAM prohibits simultaneous access. Performance\ntests reveal R-MRAM’s superiority, particularly in Spiking\nNeural Networks for image cl...",
      "contentLength": 983
    },
    {
      "index": 5,
      "paperId": "2ce232110efddaa5544b276a2c37a200d43351e6",
      "chunkId": "63105d19-5a6b-491e-8fda-c67c617ffcc5",
      "chunkIndex": 6,
      "semanticScore": 0.69353771825384,
      "keywordScore": 0,
      "combinedScore": 0.0106060606060606,
      "contentPreview": "computing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution. By relying on the\ncharacteristics of the memory device itself, data can be maintained\nin the memory...",
      "contentLength": 878
    },
    {
      "index": 6,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "34b2b409-0898-476e-bcb7-d89cbdfdd69b",
      "chunkIndex": 32,
      "semanticScore": 0.692034742337817,
      "keywordScore": 0,
      "combinedScore": 0.0104477611940298,
      "contentPreview": "the MTJ cell size\nduring fabrication or by adjusting the Ms and Hk values at the\nmaterial level during the stack development.\nAn MTJ cell with a high∆value requires high switching\nlatency and energy. This is because the height of the thermal\nbarrier is greater for a high∆value, requiring more curren...",
      "contentLength": 970
    },
    {
      "index": 7,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "chunkId": "66af31a5-7ee0-49b7-b162-a17aabd24fc5",
      "chunkIndex": 7,
      "semanticScore": 0.692010743240313,
      "keywordScore": 0,
      "combinedScore": 0.0102941176470588,
      "contentPreview": "ring element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16]. Isolate read and write\npath allows the designer to optimize the read and write path\nindependently, ...",
      "contentLength": 751
    },
    {
      "index": 8,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "e6faf7d1-2cae-4812-a6aa-13f61ad58a8c",
      "chunkIndex": 23,
      "semanticScore": 0.691612402603409,
      "keywordScore": 0,
      "combinedScore": 0.0101449275362319,
      "contentPreview": "OUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2. A typical MTJ cell consists of two\nferromagnetic layers separated by an oxide layer. The magnetic\no...",
      "contentLength": 867
    },
    {
      "index": 9,
      "paperId": "25600bb5db74348871ef61d34817117f29aa77f9",
      "chunkId": "ea536e5f-eba4-46d0-917a-1dd3d9098f77",
      "chunkIndex": 25,
      "semanticScore": 0.689858347877839,
      "keywordScore": 0,
      "combinedScore": 0.01,
      "contentPreview": "device gave\nuseful characteristics, including non-volatile storage of information [53]. FM integrated\ncircuit realization could meet all the requirements and be commercialized in the early\n1990s [54].\nAside from using PZT instead of BTO, the main difference from the earlier 1950s\nattempts was that a...",
      "contentLength": 766
    },
    {
      "index": 10,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "01f872d7-cce8-4465-a408-c7dbdb086c4c",
      "chunkIndex": 19,
      "semanticScore": 0.688980601416273,
      "keywordScore": 0,
      "combinedScore": 0.00985915492957746,
      "contentPreview": "re is a strong need to understand the factors that\ncurrently limit the design and deployment of DS-IMC\nusing STT-MRAM. We provide some suggestions on\nresearch directions for addressing these gaps.\nII. BACKGROUND\nSTT-MRAM is a non-volatile memory (NVM) technology\nthat outperforms other technologies s...",
      "contentLength": 949
    },
    {
      "index": 11,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "9326b902-e5e3-4227-8eb3-9c185ea25730",
      "chunkIndex": 125,
      "semanticScore": 0.687893610684063,
      "keywordScore": 0,
      "combinedScore": 0.00972222222222222,
      "contentPreview": "ng STT-MRAM. One such challenge is understanding how\ndifferent cell array architectures perform logic operations. For\ninstance, the CRAM architecture [82], [75], [88] uses 2T-1M\ncells for computation. This process involves connecting three\nMTJ devices to the logic line, setting the output to \"0\" or\n...",
      "contentLength": 866
    },
    {
      "index": 12,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "63123fa2-5aec-4724-9232-9d871c9b3993",
      "chunkIndex": 25,
      "semanticScore": 0.687046738121365,
      "keywordScore": 0,
      "combinedScore": 0.00958904109589041,
      "contentPreview": "e TMR ratio is given by the\nfollowing equation [36]:\nTMR=\nR\nAP\n−R\nP\nR\nP\n(1)\nData stored in an STT-MRAM cell is read when a read\ncurrent (I\nr\n) flows through the MTJ cell to sense its resistance\nstate. Likewise, data is written into an STT-MRAM cell when\na write current (I\nw\n) is much higher than the...",
      "contentLength": 998
    },
    {
      "index": 13,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "4cf310e9-f20d-4727-a91d-fffb3388fb14",
      "chunkIndex": 68,
      "semanticScore": 0.6848033494702,
      "keywordScore": 0,
      "combinedScore": 0.00945945945945946,
      "contentPreview": "to recent\nASIC implementations.\nThe article introduces CRAM [89], a memory design capa-\nble of in-memory logic operations. CRAM has two variants:\nSpin Torque Transfer (STT) and Spin-Hall Effect (SHE).\nBoth use a three-cell structure in a column, with even and\nodd bitlines (BLE/O) for read and write ...",
      "contentLength": 942
    },
    {
      "index": 14,
      "paperId": "25600bb5db74348871ef61d34817117f29aa77f9",
      "chunkId": "f2311ab4-2cf2-4ceb-9fed-ad6a5212c5c5",
      "chunkIndex": 59,
      "semanticScore": 0.684570035941891,
      "keywordScore": 0,
      "combinedScore": 0.00933333333333333,
      "contentPreview": "ready been proposed, where the ferroelectric tunnel junction and the memristor\nare combined (Figure 1c). So far, the only commercially successful concept is ferroelectric\nrandom access memory (FeRAM). FeRAM devices demonstrate a high read and write\nspeed (~10 ns), a giant resource (~10\n14\nswitchings...",
      "contentLength": 857
    },
    {
      "index": 15,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "02bbd270-5b1b-4f9c-8f59-e7b3af07a61c",
      "chunkIndex": 3,
      "semanticScore": 0.684044392369857,
      "keywordScore": 0,
      "combinedScore": 0.00921052631578947,
      "contentPreview": "omputing, spin-transfer torque RAM.\nI. INTRODUCTION AND MOTIVATION\nMost modern computer systems are based on the von Neu-\nmann architecture, where memory units are separated from\nthe processing units. During program execution, data must\nbe transferred back and forth between the processing and\nmemory...",
      "contentLength": 746
    },
    {
      "index": 16,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "27f8f473-13ad-43e8-b5fe-6c1eda2847ba",
      "chunkIndex": 22,
      "semanticScore": 0.682205959828948,
      "keywordScore": 0,
      "combinedScore": 0.00909090909090909,
      "contentPreview": "4.0/\n\nBit Line\n(BL)\na)\nWord\nLine\n(WL)\nSource\nLine (SL)\nBL\nb)\nSL\nFree Layer\nBarrier Layer\nReference Layer\nWL\nAccess\nTransistor\nFIGURE 2:Types of MTJs used in STT-MRAM IMC\ndesign a) In-Plane MTJ design. b) Interface-Perpendicular\nMTJ design.\nIn this section, we provide a summary background on\nSTT-MRAM...",
      "contentLength": 925
    },
    {
      "index": 17,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "chunkId": "dfc0b4b0-3c1c-4c6d-9fe3-503b71735176",
      "chunkIndex": 116,
      "semanticScore": 0.681776223333834,
      "keywordScore": 0,
      "combinedScore": 0.00897435897435897,
      "contentPreview": "on STT-MRAM in their design.\n6) Error Correction and Fault Tolerance\nSTT-MRAM devices are susceptible to various types of errors,\nincluding write disturbance, read disturbance, and process\nvariations. Error correction codes (ECC) and fault tolerance\nmechanisms, such as redundancy and error detection...",
      "contentLength": 919
    },
    {
      "index": 18,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "chunkId": "045bba48-8569-4994-adbe-6c3a80467abe",
      "chunkIndex": 8,
      "semanticScore": 0.681013646866965,
      "keywordScore": 0,
      "combinedScore": 0.00886075949367088,
      "contentPreview": "have demonstrated the successful fabrication\nof SOT-MRAM with attractive specifications. Its attractive\narXiv:2303.12310v2 [cs.AR] 14 Nov 2023\n\nIEEE TRANSACTIONS ON COMPUTER-AIDED DESIGN, VOL. XX, NO. X, AUGUST 202X2\nSystem Technology Co-Optimization\n(STCO)\nDesign Technology Co-Optimization\n(DTCO)\nO...",
      "contentLength": 988
    },
    {
      "index": 19,
      "paperId": "2ce232110efddaa5544b276a2c37a200d43351e6",
      "chunkId": "af9b2339-090a-4e96-9983-9867e5e6b0c2",
      "chunkIndex": 5,
      "semanticScore": 0.680893482790632,
      "keywordScore": 0,
      "combinedScore": 0.00875,
      "contentPreview": "ted, LiM also has the potential to significantly degrade\nthe time complexity of certain specific computational tasks due to\nthe massive nature of memory arrays and the high parallelism of\ncomputation.\nCurrently, there are a variety of memory technologies that have\nbeen proven to implement LiM, such ...",
      "contentLength": 935
    }
  ]
}
```

## 3. Paper Metadata

```json
{
  "paperIds": [
    "0bef739daada6e2737fdb101ce36a90f60f17272",
    "4ef86160b00fbcd0e378f07358fae1296fee081a",
    "2ce232110efddaa5544b276a2c37a200d43351e6",
    "25600bb5db74348871ef61d34817117f29aa77f9"
  ],
  "metadata": {
    "25600bb5db74348871ef61d34817117f29aa77f9": {
      "title": "Ferroelectric Devices for Content-Addressable Memory",
      "year": 2022,
      "authors": "M. Tarkov, F. Tikhonenko, V. Popov et al."
    },
    "4ef86160b00fbcd0e378f07358fae1296fee081a": {
      "title": "System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System",
      "year": 2023,
      "authors": "Kaniz Mishty, Mehdi Sadi"
    },
    "0bef739daada6e2737fdb101ce36a90f60f17272": {
      "title": "Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey",
      "year": 2024,
      "authors": "Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria"
    },
    "2ce232110efddaa5544b276a2c37a200d43351e6": {
      "title": "High-performance STT-MRAM Logic-in-Memory Scheme Utilizing Data Read Features",
      "year": 2022,
      "authors": "Kai Liu, Bi Wu, Haonan Zhu et al."
    }
  }
}
```

## 4. Built Context for LLM

```json
{
  "contextLength": 20913,
  "fullContext": "[1] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nplayers, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT). Notably,\nEverspin introduced a 3rd generation standalone 256Mb STT-\nMRAM (pMTJ) and a 1Gb STT-MRAM. Collaborative efforts\nby Samsung, Sony, and Avalanche resulted in the development\nof 28nm eSTT-MRAM (pMTJ) and eSTT-MRAM (pMTJ)\nwith a 40nm node. Everspin offers a range of MRAM products,\nincluding Toggle-mode MRAM (1st generation) and STT-\nMRAM (2nd to 4th generation), with variations in MTJ\nstructures.\nDespite the appealing features of STT-MRAM, its adoption\nfaces challenges. Chi et al. [19] point out that the write opera-\ntion is generally slower and more energy-consuming than the\nread operation. As technology advances, the decreasing write\ncurrent, coupled with the limited scalability of read current,\nleads to increased read disturbance errors [33].\n---\n\n[2] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nSTT-MRAM (spin-transfer torque magnetic\nRandom Access Memory), PCRAM (phase-change RAM),\nand ReRAM (resistive RAM), among others, are pursued to\nfulfill some of these characteristics [12], [13], [14]. These\nNVMs share common features as nonvolatile two-terminal\ndevices, distinguishing states through high-resistance (HRS)\nand low-resistance (LRS) states with differing switching\nmechanisms. STT-MRAM uses ferromagnetic layers, and\nrelies on the manipulation of electron spins to switch between\nthese resistance states, while PCRAM relies on phase change\nin materials to achieve the same objective, and ReRAM\nchanges resistance by altering the conductivity of a material,\ntypically metal oxides, through the migration of defects. These\nNVM technologies offer diverse solutions for nonvolatile data\nstorage with various advantages and characteristics.\n---\n\n[3] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\ne performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM. Large write delay (> ns\nrange) resulting from spin injection symmetry in switching\nthe magnetic orientation of free layer belittles STT-MRAM’s\nfeasibility as an on-chip cache [13]. The stress on the dielectric\noxide of the MTJ due to the large write current accelerates the\ntime-dependent wear out of the cell [14]. Second, its shared\nread-write path makes it vulnerable to RD.\nSOT MRAM, considered the next generation of STT-MRAM,\noffers high performance without compromising reliability issues\nsuch as RD. SOT-MRAM is a three-terminal memory cell that\nuses MTJ as the storing element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16].\n---\n\n[4] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nagainst radiation-induced soft errors,\nand CMOS compatibility of emerging Spin-based non-volatile\n(NVM) magnetic memory (i.e., MRAM) technologies, attracted\nresearchers from academia and industry [7]. Spin Transfer\nTorque (STT) MRAM, has already shifted its gear from\nthe R&D phase to commercialization as the NAND-based\nembedded flash replacement [8] [9]. However, MRAM in its\nregular form cannot be used in AI accelerators due to its slow\nwrite speed and high write energy [9] [10].\nSTT-MRAM, a two-terminal magnetic memory with Mag-\nnetic Tunnel Junction (MTJ) as the storing element, flows a\nbidirectional spin-polarized current through the MTJ for read-\nwrite operation [11]. The major challenges of STT-MRAM\n- poor write performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM.\n---\n\n[5] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nation in both RAM and ROM modes. Conversely, R-\nMRAM merges ROM with STT-MRAM, using an additional\nBit Line (BL) for ROM data. While supporting RAM and ROM\nmodes, R-MRAM prohibits simultaneous access. Performance\ntests reveal R-MRAM’s superiority, particularly in Spiking\nNeural Networks for image classification, showing 1.75 times\nlower energy consumption than standard STT-MRAM arrays.\nThis study underscores the advantages of integrating ROM into\nRAM-based in-memory hardware, exemplified in the SPARE\n10VOLUME 11, 2023\nThis article has been accepted for publication in IEEE Access. This is the author's version which has not been fully edited and\ncontent may change prior to final publication. Citation information: DOI 10.1109/ACCESS.2024.3365632\nThis work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 License. For more information, see https://creativecommons.org/licenses/by-nc-nd/4.0/\n\nproject, advancing efficient cognitive computing.\nB.\n---\n\n[6] Source: \"High-performance STT-MRAM Logic-in-Memory Scheme Utilizing Data Read Features\" (Kai Liu, Bi Wu, Haonan Zhu et al., 2022)\n---\ncomputing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution. By relying on the\ncharacteristics of the memory device itself, data can be maintained\nin the memory after power is turned off, in which case the static\npower consumption of the memory can be significantly reduced.\nAmong these technologies, Spin-transfer Torque Magnetic RAM\n(STT-MRAM) is one of the most promising candidate owing to its\nfast access speed, near-zero leakage power, and high density.\nNumerous Logic-in-Memory schemes exploiting memory arrays\nhave implemented elementary Boolean logic (XNOR, XOR, AND\nand OR) and arithmetic operations. Two mainstream technology\napproaches exist, one is sensing-based scheme and the other is\nwriting-based scheme [4]. Zhang et al.\n---\n\n[7] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nthe MTJ cell size\nduring fabrication or by adjusting the Ms and Hk values at the\nmaterial level during the stack development.\nAn MTJ cell with a high∆value requires high switching\nlatency and energy. This is because the height of the thermal\nbarrier is greater for a high∆value, requiring more current for\na longer duration to perform the switching. Its relation with Ic\ncan be modeled using the following equation [45]:\nI\nc\n=\n4.e.K\nB\n.T\nh\n.\nα\nη\n.∆.(1 +\n4.π.M\neff\n2.H\nk\n)(3)\nwhere h is Planks constant,αis the Landau-Lifshitz- Gilbert\n(LLG) damping constant, which plays an important role in the\nspin dynamics of ferromagnetic systems [46],ηis the STT-\nMRAM efficiency parameter and 4π. M\neff\nis the effective\ndemagnetization field.\n2) Challenges with STT-MRAM\nWith a low∆value, the STT-MRAM write latency and energy\ncan be significantly reduced. However, reducing the∆value\nincreases the retention failure rates and the possibility of read\ndisturbance and write errors.\n---\n\n[8] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nring element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16]. Isolate read and write\npath allows the designer to optimize the read and write path\nindependently, decreasing the write current and increasing\nthe read-write operating margin, thus solving the RD-induced\nreliability issues. Though lacking mass-scale production from\nfoundries due to early-stage manufacturing challenges, [9] [10]\n[12] [13] [16] [17] have demonstrated the successful fabrication\nof SOT-MRAM with attractive specifications. Its attractive\narXiv:2303.12310v2 [cs.AR] 14 Nov 2023\n\nIEEE TRANSACTIONS ON COMPUTER-AIDED DESIGN, VOL. XX, NO.\n---\n\n[9] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nOUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2. A typical MTJ cell consists of two\nferromagnetic layers separated by an oxide layer. The magnetic\norientation of one layer, the free layer, can be freely rotated,\nwhile the magnetization of the other layer, the reference layer,\nis fixed. Thus, the magnetization of the free layer can be\nparallel or anti-parallel to the reference layer. As a result, the\nelectric resistance of the MTJ cell changes to high for anti-\nparallel and low for parallel magnetization. These two states\nrepresent bits \"0\" and \"1\", respectively. The difference in the\nelectric resistance values denoted as Rap and Rp, respectively,\nis what is known as \"tunnel magneto-resistance\" (TMR) ratio.\n---\n\n[10] Source: \"Ferroelectric Devices for Content-Addressable Memory\" (M. Tarkov, F. Tikhonenko, V. Popov et al., 2022)\n---\ndevice gave\nuseful characteristics, including non-volatile storage of information [53]. FM integrated\ncircuit realization could meet all the requirements and be commercialized in the early\n1990s [54].\nAside from using PZT instead of BTO, the main difference from the earlier 1950s\nattempts was that a selecting transistor was added to the memory cell, resulting in a cell\nstructure similar to dynamic random access memory ICs (DRAM). The sampling tran-\nsistor eliminated the problems associated with accessing other columns of bits (bitline)\nand lines of words (wordline). However, PZT capasitors were subject to material fatigue\ndegradation, which manifested itself in a decrease in switchable polarization with an in-\ncrease in the number of read and write cycles.\n---\n\n[11] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nre is a strong need to understand the factors that\ncurrently limit the design and deployment of DS-IMC\nusing STT-MRAM. We provide some suggestions on\nresearch directions for addressing these gaps.\nII. BACKGROUND\nSTT-MRAM is a non-volatile memory (NVM) technology\nthat outperforms other technologies such as ferroelectric field\neffect transistor (Fe-FET), phase change memory (PCM), and\nresistive RAM (RRAM), particularly in terms of read time and\nenergy efficiency [29]. In addition, STT-MRAM, more so than\nmany other emerging NVM technologies, has demonstrated\ncommercial viability [31], making it one of the best alternatives\nfor IMC studies. Choe et al. [32] emphasize the dynamic\nresearch and development of STT-MRAM technology by\nmajor industry players, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT).\n---\n\n[12] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nng STT-MRAM. One such challenge is understanding how\ndifferent cell array architectures perform logic operations. For\ninstance, the CRAM architecture [82], [75], [88] uses 2T-1M\ncells for computation. This process involves connecting three\nMTJ devices to the logic line, setting the output to \"0\" or\n\"1\", and applying the appropriate bias voltage to the MTJs’\nbit select lines (BSLs), while the output MTJ is grounded\nto implement \"NAND\" or \"NOR\" operations. This approach\nreduces the need for some hardware components, such as sense\namplifiers and some logic gates, which might be necessary in\nother designs like those described in [93], [95], [80].\nReducing communication overhead poses another challenge,\nnecessitating designs that enable logic operations across\nmultiple rows instead of the same row, as seen in the original\nCRAM architecture [89]. Zabihi et al.\n---\n\n[13] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\ne TMR ratio is given by the\nfollowing equation [36]:\nTMR=\nR\nAP\n−R\nP\nR\nP\n(1)\nData stored in an STT-MRAM cell is read when a read\ncurrent (I\nr\n) flows through the MTJ cell to sense its resistance\nstate. Likewise, data is written into an STT-MRAM cell when\na write current (I\nw\n) is much higher than the read and the critical\ncurrent (I\nc\n), which is the minimum current required to switch\nthe magnetization of the MTJ for a given write pulse. A high\nwrite current or pulse results in high dynamic energy. This\nissue is further exacerbated due to the stochastic nature of the\nwriting (switching) process as well as the high sensitivity to\nprocess variation, thereby leading to large timing margins [37],\nas described in SectionII-A2d. The key parameter of the MTJ\nis the Thermal Stability Factor∆, which specifies the stability\nof the magnetic orientation of the free layer against thermal\nnoise [38], [39], [40]\nLots of research works address some of the issues discussed\nabove as it relates to MTJs.\n---\n\n[14] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nto recent\nASIC implementations.\nThe article introduces CRAM [89], a memory design capa-\nble of in-memory logic operations. CRAM has two variants:\nSpin Torque Transfer (STT) and Spin-Hall Effect (SHE).\nBoth use a three-cell structure in a column, with even and\nodd bitlines (BLE/O) for read and write on Magnetic Tunnel\nVOLUME 11, 20239\nThis article has been accepted for publication in IEEE Access. This is the author's version which has not been fully edited and\ncontent may change prior to final publication. Citation information: DOI 10.1109/ACCESS.2024.3365632\nThis work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 License. For more information, see https://creativecommons.org/licenses/by-nc-nd/4.0/\n\nJunctions (MTJs). BLE/O determine input and output MTJs for\nlogic ops, while logic lines (LL) link input and output cells for\nBoolean computation. Wordlines (WL) select rows for memory\nand logic ops.\n---\n\n[15] Source: \"Ferroelectric Devices for Content-Addressable Memory\" (M. Tarkov, F. Tikhonenko, V. Popov et al., 2022)\n---\nready been proposed, where the ferroelectric tunnel junction and the memristor\nare combined (Figure 1c). So far, the only commercially successful concept is ferroelectric\nrandom access memory (FeRAM). FeRAM devices demonstrate a high read and write\nspeed (~10 ns), a giant resource (~10\n14\nswitchings), and have already found their niche in\nthe market of modern non-volatile memory [54,57,58,60].\nIn FeRAM 1T1C cell, during a destructive read, the polarization-switchable charge\nis transferred through the sampling transistor to the discharge line (BL) (Figure 3a). Just\nas with DRAM, the sensitivity amplifier determines the stored logic state. The read cy-\ncle must be completed by restoring the information. Therefore, each read cycle also\nincreases the write time. Using PZT as a ferroelectric, it is possible to achieve a cycle life\nof~10\n6\nswitchings.\n---\n\n[16] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nomputing, spin-transfer torque RAM.\nI. INTRODUCTION AND MOTIVATION\nMost modern computer systems are based on the von Neu-\nmann architecture, where memory units are separated from\nthe processing units. During program execution, data must\nbe transferred back and forth between the processing and\nmemory units, leading to significant costs in latency and\nenergy. The latency associated with accessing data from the\nmemory units is the critical performance bottleneck for a\nbroad range of applications, given the \"memory wall\" [1]—\nthe significant disparity between the speed of the memory\nand processing units. In addition, the energy cost of moving\ndata is another significant challenge, given the fact that the\ncomputing systems are power-limited.\n---\n\n[17] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\n4.0/\n\nBit Line\n(BL)\na)\nWord\nLine\n(WL)\nSource\nLine (SL)\nBL\nb)\nSL\nFree Layer\nBarrier Layer\nReference Layer\nWL\nAccess\nTransistor\nFIGURE 2:Types of MTJs used in STT-MRAM IMC\ndesign a) In-Plane MTJ design. b) Interface-Perpendicular\nMTJ design.\nIn this section, we provide a summary background on\nSTT-MRAM and discuss its retention time, an important\nconfigurable design parameter in STT-MRAM with significant\nimplications for its efficiency. Thereafter, we summarize some\nof the main challenges associated with using STT-MRAM\nin practice and explore some methods for addressing those\nchallenges. In addition, we also provide a brief overview of\ndomain-specific architectures (DSA) and the components that\nmake up a DSA.\nA. BACKGROUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2.\n---\n\n[18] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\non STT-MRAM in their design.\n6) Error Correction and Fault Tolerance\nSTT-MRAM devices are susceptible to various types of errors,\nincluding write disturbance, read disturbance, and process\nvariations. Error correction codes (ECC) and fault tolerance\nmechanisms, such as redundancy and error detection and\ncorrection techniques, should be implemented to ensure data\nintegrity, reliability, and resilience in the presence of errors. For\nexample, Resch et al. [74] addressed write disturbance issues in\ntheir PIMBALL design by increasing the switching current (Ic)\nby 1.5x, thereby improving the write current. In another study,\nGajaria et al. [18] tackled the effects of process variation in\ntheir processing-in-cache and processing-in-memory designs.\nThey accomplished this by incorporating multiple retention\ntimes through variations in the STT-MRAM parameters, such\nas the free layer thickness and anisotropy constant.\n---\n\n[19] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nhave demonstrated the successful fabrication\nof SOT-MRAM with attractive specifications. Its attractive\narXiv:2303.12310v2 [cs.AR] 14 Nov 2023\n\nIEEE TRANSACTIONS ON COMPUTER-AIDED DESIGN, VOL. XX, NO. X, AUGUST 202X2\nSystem Technology Co-Optimization\n(STCO)\nDesign Technology Co-Optimization\n(DTCO)\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB1MB2MB2\nMB3MB3MB4MB4\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB2\nMB3MB4\nSystem Technology Co-Optimization\n(STCO)\nDesign Technology Co-Optimization\n(DTCO)\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB2\nMB3MB4\nClosed Loop STCO and DTCO for Power and Performance Optimized AI/Deep Learning Accelerator Design\nMLP\nBottom\nMLP\nBottom\nMLP\nTop\nMLP\nTop\nConcat.Concat.\n---\n\n[20] Source: \"High-performance STT-MRAM Logic-in-Memory Scheme Utilizing Data Read Features\" (Kai Liu, Bi Wu, Haonan Zhu et al., 2022)\n---\nted, LiM also has the potential to significantly degrade\nthe time complexity of certain specific computational tasks due to\nthe massive nature of memory arrays and the high parallelism of\ncomputation.\nCurrently, there are a variety of memory technologies that have\nbeen proven to implement LiM, such as Static Random Access\nMemory (SRAM) [22], Dynamic RAM (DRAM) [19] and emerg-\ning Non-volatile Memory (NVM) technologies. While for the con-\nventional CMOS-based memory technologies, especially the high-\nperformance SRAM, the high static power consumption caused by\nthe continuous shrinking of the process node and the low density\ncaused by the large area of the storage cell seriously limit its de-\nvelopment in the high-performance computing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution.\n---"
}
```

## 5. Gemini API Request

```json
{
  "model": "gemini-3-pro-preview",
  "systemInstruction": "You are CiteBite, an AI research assistant specialized in analyzing academic papers.\n\n## YOUR ROLE\nYou help researchers understand and synthesize findings from their paper collection. You will be provided with relevant excerpts from research papers as context.\n\n## CITATION FORMAT (CRITICAL)\n- Use [CITE:N] markers to cite sources (e.g., [CITE:1], [CITE:2])\n- Each number corresponds to the source excerpt provided in the context\n- You MUST cite sources for every factual claim you make\n- If multiple sources support a claim, cite all of them (e.g., [CITE:1][CITE:3])\n\n## RESPONSE STRUCTURE\n1. Lead with the most relevant findings\n2. Support each claim with [CITE:N] citations\n3. When synthesizing across sources, cite all relevant ones\n4. Be specific - include numbers, methods, or conclusions that can be traced to sources\n\n## HANDLING LIMITATIONS\n- If context doesn't contain relevant information: \"Based on the available excerpts, I couldn't find specific information about [topic].\"\n- If only one source is relevant: Acknowledge this and provide what you can\n- If information conflicts: Present both perspectives with their citations\n\nRemember: Every statement must be supported by the provided context using [CITE:N] format.",
  "temperature": 0.2,
  "maxOutputTokens": 4096,
  "contentsCount": 1,
  "userPrompt": "Based on the following research paper excerpts, answer the question.\nUse [CITE:N] markers to cite specific sources (e.g., [CITE:1], [CITE:2]).\n\n## Context from Papers:\n\n[1] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nplayers, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT). Notably,\nEverspin introduced a 3rd generation standalone 256Mb STT-\nMRAM (pMTJ) and a 1Gb STT-MRAM. Collaborative efforts\nby Samsung, Sony, and Avalanche resulted in the development\nof 28nm eSTT-MRAM (pMTJ) and eSTT-MRAM (pMTJ)\nwith a 40nm node. Everspin offers a range of MRAM products,\nincluding Toggle-mode MRAM (1st generation) and STT-\nMRAM (2nd to 4th generation), with variations in MTJ\nstructures.\nDespite the appealing features of STT-MRAM, its adoption\nfaces challenges. Chi et al. [19] point out that the write opera-\ntion is generally slower and more energy-consuming than the\nread operation. As technology advances, the decreasing write\ncurrent, coupled with the limited scalability of read current,\nleads to increased read disturbance errors [33].\n---\n\n[2] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nSTT-MRAM (spin-transfer torque magnetic\nRandom Access Memory), PCRAM (phase-change RAM),\nand ReRAM (resistive RAM), among others, are pursued to\nfulfill some of these characteristics [12], [13], [14]. These\nNVMs share common features as nonvolatile two-terminal\ndevices, distinguishing states through high-resistance (HRS)\nand low-resistance (LRS) states with differing switching\nmechanisms. STT-MRAM uses ferromagnetic layers, and\nrelies on the manipulation of electron spins to switch between\nthese resistance states, while PCRAM relies on phase change\nin materials to achieve the same objective, and ReRAM\nchanges resistance by altering the conductivity of a material,\ntypically metal oxides, through the migration of defects. These\nNVM technologies offer diverse solutions for nonvolatile data\nstorage with various advantages and characteristics.\n---\n\n[3] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\ne performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM. Large write delay (> ns\nrange) resulting from spin injection symmetry in switching\nthe magnetic orientation of free layer belittles STT-MRAM’s\nfeasibility as an on-chip cache [13]. The stress on the dielectric\noxide of the MTJ due to the large write current accelerates the\ntime-dependent wear out of the cell [14]. Second, its shared\nread-write path makes it vulnerable to RD.\nSOT MRAM, considered the next generation of STT-MRAM,\noffers high performance without compromising reliability issues\nsuch as RD. SOT-MRAM is a three-terminal memory cell that\nuses MTJ as the storing element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16].\n---\n\n[4] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nagainst radiation-induced soft errors,\nand CMOS compatibility of emerging Spin-based non-volatile\n(NVM) magnetic memory (i.e., MRAM) technologies, attracted\nresearchers from academia and industry [7]. Spin Transfer\nTorque (STT) MRAM, has already shifted its gear from\nthe R&D phase to commercialization as the NAND-based\nembedded flash replacement [8] [9]. However, MRAM in its\nregular form cannot be used in AI accelerators due to its slow\nwrite speed and high write energy [9] [10].\nSTT-MRAM, a two-terminal magnetic memory with Mag-\nnetic Tunnel Junction (MTJ) as the storing element, flows a\nbidirectional spin-polarized current through the MTJ for read-\nwrite operation [11]. The major challenges of STT-MRAM\n- poor write performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM.\n---\n\n[5] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nation in both RAM and ROM modes. Conversely, R-\nMRAM merges ROM with STT-MRAM, using an additional\nBit Line (BL) for ROM data. While supporting RAM and ROM\nmodes, R-MRAM prohibits simultaneous access. Performance\ntests reveal R-MRAM’s superiority, particularly in Spiking\nNeural Networks for image classification, showing 1.75 times\nlower energy consumption than standard STT-MRAM arrays.\nThis study underscores the advantages of integrating ROM into\nRAM-based in-memory hardware, exemplified in the SPARE\n10VOLUME 11, 2023\nThis article has been accepted for publication in IEEE Access. This is the author's version which has not been fully edited and\ncontent may change prior to final publication. Citation information: DOI 10.1109/ACCESS.2024.3365632\nThis work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 License. For more information, see https://creativecommons.org/licenses/by-nc-nd/4.0/\n\nproject, advancing efficient cognitive computing.\nB.\n---\n\n[6] Source: \"High-performance STT-MRAM Logic-in-Memory Scheme Utilizing Data Read Features\" (Kai Liu, Bi Wu, Haonan Zhu et al., 2022)\n---\ncomputing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution. By relying on the\ncharacteristics of the memory device itself, data can be maintained\nin the memory after power is turned off, in which case the static\npower consumption of the memory can be significantly reduced.\nAmong these technologies, Spin-transfer Torque Magnetic RAM\n(STT-MRAM) is one of the most promising candidate owing to its\nfast access speed, near-zero leakage power, and high density.\nNumerous Logic-in-Memory schemes exploiting memory arrays\nhave implemented elementary Boolean logic (XNOR, XOR, AND\nand OR) and arithmetic operations. Two mainstream technology\napproaches exist, one is sensing-based scheme and the other is\nwriting-based scheme [4]. Zhang et al.\n---\n\n[7] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nthe MTJ cell size\nduring fabrication or by adjusting the Ms and Hk values at the\nmaterial level during the stack development.\nAn MTJ cell with a high∆value requires high switching\nlatency and energy. This is because the height of the thermal\nbarrier is greater for a high∆value, requiring more current for\na longer duration to perform the switching. Its relation with Ic\ncan be modeled using the following equation [45]:\nI\nc\n=\n4.e.K\nB\n.T\nh\n.\nα\nη\n.∆.(1 +\n4.π.M\neff\n2.H\nk\n)(3)\nwhere h is Planks constant,αis the Landau-Lifshitz- Gilbert\n(LLG) damping constant, which plays an important role in the\nspin dynamics of ferromagnetic systems [46],ηis the STT-\nMRAM efficiency parameter and 4π. M\neff\nis the effective\ndemagnetization field.\n2) Challenges with STT-MRAM\nWith a low∆value, the STT-MRAM write latency and energy\ncan be significantly reduced. However, reducing the∆value\nincreases the retention failure rates and the possibility of read\ndisturbance and write errors.\n---\n\n[8] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nring element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16]. Isolate read and write\npath allows the designer to optimize the read and write path\nindependently, decreasing the write current and increasing\nthe read-write operating margin, thus solving the RD-induced\nreliability issues. Though lacking mass-scale production from\nfoundries due to early-stage manufacturing challenges, [9] [10]\n[12] [13] [16] [17] have demonstrated the successful fabrication\nof SOT-MRAM with attractive specifications. Its attractive\narXiv:2303.12310v2 [cs.AR] 14 Nov 2023\n\nIEEE TRANSACTIONS ON COMPUTER-AIDED DESIGN, VOL. XX, NO.\n---\n\n[9] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nOUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2. A typical MTJ cell consists of two\nferromagnetic layers separated by an oxide layer. The magnetic\norientation of one layer, the free layer, can be freely rotated,\nwhile the magnetization of the other layer, the reference layer,\nis fixed. Thus, the magnetization of the free layer can be\nparallel or anti-parallel to the reference layer. As a result, the\nelectric resistance of the MTJ cell changes to high for anti-\nparallel and low for parallel magnetization. These two states\nrepresent bits \"0\" and \"1\", respectively. The difference in the\nelectric resistance values denoted as Rap and Rp, respectively,\nis what is known as \"tunnel magneto-resistance\" (TMR) ratio.\n---\n\n[10] Source: \"Ferroelectric Devices for Content-Addressable Memory\" (M. Tarkov, F. Tikhonenko, V. Popov et al., 2022)\n---\ndevice gave\nuseful characteristics, including non-volatile storage of information [53]. FM integrated\ncircuit realization could meet all the requirements and be commercialized in the early\n1990s [54].\nAside from using PZT instead of BTO, the main difference from the earlier 1950s\nattempts was that a selecting transistor was added to the memory cell, resulting in a cell\nstructure similar to dynamic random access memory ICs (DRAM). The sampling tran-\nsistor eliminated the problems associated with accessing other columns of bits (bitline)\nand lines of words (wordline). However, PZT capasitors were subject to material fatigue\ndegradation, which manifested itself in a decrease in switchable polarization with an in-\ncrease in the number of read and write cycles.\n---\n\n[11] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nre is a strong need to understand the factors that\ncurrently limit the design and deployment of DS-IMC\nusing STT-MRAM. We provide some suggestions on\nresearch directions for addressing these gaps.\nII. BACKGROUND\nSTT-MRAM is a non-volatile memory (NVM) technology\nthat outperforms other technologies such as ferroelectric field\neffect transistor (Fe-FET), phase change memory (PCM), and\nresistive RAM (RRAM), particularly in terms of read time and\nenergy efficiency [29]. In addition, STT-MRAM, more so than\nmany other emerging NVM technologies, has demonstrated\ncommercial viability [31], making it one of the best alternatives\nfor IMC studies. Choe et al. [32] emphasize the dynamic\nresearch and development of STT-MRAM technology by\nmajor industry players, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT).\n---\n\n[12] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nng STT-MRAM. One such challenge is understanding how\ndifferent cell array architectures perform logic operations. For\ninstance, the CRAM architecture [82], [75], [88] uses 2T-1M\ncells for computation. This process involves connecting three\nMTJ devices to the logic line, setting the output to \"0\" or\n\"1\", and applying the appropriate bias voltage to the MTJs’\nbit select lines (BSLs), while the output MTJ is grounded\nto implement \"NAND\" or \"NOR\" operations. This approach\nreduces the need for some hardware components, such as sense\namplifiers and some logic gates, which might be necessary in\nother designs like those described in [93], [95], [80].\nReducing communication overhead poses another challenge,\nnecessitating designs that enable logic operations across\nmultiple rows instead of the same row, as seen in the original\nCRAM architecture [89]. Zabihi et al.\n---\n\n[13] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\ne TMR ratio is given by the\nfollowing equation [36]:\nTMR=\nR\nAP\n−R\nP\nR\nP\n(1)\nData stored in an STT-MRAM cell is read when a read\ncurrent (I\nr\n) flows through the MTJ cell to sense its resistance\nstate. Likewise, data is written into an STT-MRAM cell when\na write current (I\nw\n) is much higher than the read and the critical\ncurrent (I\nc\n), which is the minimum current required to switch\nthe magnetization of the MTJ for a given write pulse. A high\nwrite current or pulse results in high dynamic energy. This\nissue is further exacerbated due to the stochastic nature of the\nwriting (switching) process as well as the high sensitivity to\nprocess variation, thereby leading to large timing margins [37],\nas described in SectionII-A2d. The key parameter of the MTJ\nis the Thermal Stability Factor∆, which specifies the stability\nof the magnetic orientation of the free layer against thermal\nnoise [38], [39], [40]\nLots of research works address some of the issues discussed\nabove as it relates to MTJs.\n---\n\n[14] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nto recent\nASIC implementations.\nThe article introduces CRAM [89], a memory design capa-\nble of in-memory logic operations. CRAM has two variants:\nSpin Torque Transfer (STT) and Spin-Hall Effect (SHE).\nBoth use a three-cell structure in a column, with even and\nodd bitlines (BLE/O) for read and write on Magnetic Tunnel\nVOLUME 11, 20239\nThis article has been accepted for publication in IEEE Access. This is the author's version which has not been fully edited and\ncontent may change prior to final publication. Citation information: DOI 10.1109/ACCESS.2024.3365632\nThis work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 License. For more information, see https://creativecommons.org/licenses/by-nc-nd/4.0/\n\nJunctions (MTJs). BLE/O determine input and output MTJs for\nlogic ops, while logic lines (LL) link input and output cells for\nBoolean computation. Wordlines (WL) select rows for memory\nand logic ops.\n---\n\n[15] Source: \"Ferroelectric Devices for Content-Addressable Memory\" (M. Tarkov, F. Tikhonenko, V. Popov et al., 2022)\n---\nready been proposed, where the ferroelectric tunnel junction and the memristor\nare combined (Figure 1c). So far, the only commercially successful concept is ferroelectric\nrandom access memory (FeRAM). FeRAM devices demonstrate a high read and write\nspeed (~10 ns), a giant resource (~10\n14\nswitchings), and have already found their niche in\nthe market of modern non-volatile memory [54,57,58,60].\nIn FeRAM 1T1C cell, during a destructive read, the polarization-switchable charge\nis transferred through the sampling transistor to the discharge line (BL) (Figure 3a). Just\nas with DRAM, the sensitivity amplifier determines the stored logic state. The read cy-\ncle must be completed by restoring the information. Therefore, each read cycle also\nincreases the write time. Using PZT as a ferroelectric, it is possible to achieve a cycle life\nof~10\n6\nswitchings.\n---\n\n[16] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\nomputing, spin-transfer torque RAM.\nI. INTRODUCTION AND MOTIVATION\nMost modern computer systems are based on the von Neu-\nmann architecture, where memory units are separated from\nthe processing units. During program execution, data must\nbe transferred back and forth between the processing and\nmemory units, leading to significant costs in latency and\nenergy. The latency associated with accessing data from the\nmemory units is the critical performance bottleneck for a\nbroad range of applications, given the \"memory wall\" [1]—\nthe significant disparity between the speed of the memory\nand processing units. In addition, the energy cost of moving\ndata is another significant challenge, given the fact that the\ncomputing systems are power-limited.\n---\n\n[17] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\n4.0/\n\nBit Line\n(BL)\na)\nWord\nLine\n(WL)\nSource\nLine (SL)\nBL\nb)\nSL\nFree Layer\nBarrier Layer\nReference Layer\nWL\nAccess\nTransistor\nFIGURE 2:Types of MTJs used in STT-MRAM IMC\ndesign a) In-Plane MTJ design. b) Interface-Perpendicular\nMTJ design.\nIn this section, we provide a summary background on\nSTT-MRAM and discuss its retention time, an important\nconfigurable design parameter in STT-MRAM with significant\nimplications for its efficiency. Thereafter, we summarize some\nof the main challenges associated with using STT-MRAM\nin practice and explore some methods for addressing those\nchallenges. In addition, we also provide a brief overview of\ndomain-specific architectures (DSA) and the components that\nmake up a DSA.\nA. BACKGROUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2.\n---\n\n[18] Source: \"Domain-Specific STT-MRAM-Based In-Memory Computing: A Survey\" (Alaba Yusuf, Tosiron Adegbija, Dhruv Gajaria, 2024)\n---\non STT-MRAM in their design.\n6) Error Correction and Fault Tolerance\nSTT-MRAM devices are susceptible to various types of errors,\nincluding write disturbance, read disturbance, and process\nvariations. Error correction codes (ECC) and fault tolerance\nmechanisms, such as redundancy and error detection and\ncorrection techniques, should be implemented to ensure data\nintegrity, reliability, and resilience in the presence of errors. For\nexample, Resch et al. [74] addressed write disturbance issues in\ntheir PIMBALL design by increasing the switching current (Ic)\nby 1.5x, thereby improving the write current. In another study,\nGajaria et al. [18] tackled the effects of process variation in\ntheir processing-in-cache and processing-in-memory designs.\nThey accomplished this by incorporating multiple retention\ntimes through variations in the STT-MRAM parameters, such\nas the free layer thickness and anisotropy constant.\n---\n\n[19] Source: \"System and Design Technology Co-Optimization of SOT-MRAM for High-Performance AI Accelerator Memory System\" (Kaniz Mishty, Mehdi Sadi, 2023)\n---\nhave demonstrated the successful fabrication\nof SOT-MRAM with attractive specifications. Its attractive\narXiv:2303.12310v2 [cs.AR] 14 Nov 2023\n\nIEEE TRANSACTIONS ON COMPUTER-AIDED DESIGN, VOL. XX, NO. X, AUGUST 202X2\nSystem Technology Co-Optimization\n(STCO)\nDesign Technology Co-Optimization\n(DTCO)\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB1MB2MB2\nMB3MB3MB4MB4\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB2\nMB3MB4\nSystem Technology Co-Optimization\n(STCO)\nDesign Technology Co-Optimization\n(DTCO)\nOn-chip Memory\nBanks (BW adjustable)\nRead Line\nChannel\nBody\nMTJ\nRead Path\nWrite Path\nSoT bit cell\nMB1MB2\nMB3MB4\nClosed Loop STCO and DTCO for Power and Performance Optimized AI/Deep Learning Accelerator Design\nMLP\nBottom\nMLP\nBottom\nMLP\nTop\nMLP\nTop\nConcat.Concat.\n---\n\n[20] Source: \"High-performance STT-MRAM Logic-in-Memory Scheme Utilizing Data Read Features\" (Kai Liu, Bi Wu, Haonan Zhu et al., 2022)\n---\nted, LiM also has the potential to significantly degrade\nthe time complexity of certain specific computational tasks due to\nthe massive nature of memory arrays and the high parallelism of\ncomputation.\nCurrently, there are a variety of memory technologies that have\nbeen proven to implement LiM, such as Static Random Access\nMemory (SRAM) [22], Dynamic RAM (DRAM) [19] and emerg-\ning Non-volatile Memory (NVM) technologies. While for the con-\nventional CMOS-based memory technologies, especially the high-\nperformance SRAM, the high static power consumption caused by\nthe continuous shrinking of the process node and the low density\ncaused by the large area of the storage cell seriously limit its de-\nvelopment in the high-performance computing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution.\n---\n\n## Question: tell me about mram development\n\n## Instructions:\n- Answer based ONLY on the provided context\n- Use [CITE:N] format to cite sources (N is the source number)\n- If information isn't in the context, say so\n- Be specific and cite multiple sources when applicable",
  "conversationHistoryInRequest": []
}
```

## 6. Raw LLM Response

```json
{
  "rawAnswerLength": 3804,
  "rawAnswer": "Based on the provided research excerpts, the development of Magnetoresistive Random Access Memory (MRAM) has evolved through multiple generations, moving from research to commercial viability while facing specific technical challenges and architectural innovations.\n\n### Commercialization and Key Players\nSTT-MRAM (Spin-Transfer Torque MRAM) has transitioned from the research and development phase to commercialization, demonstrating greater viability than other emerging non-volatile memory technologies [CITE:4][CITE:11].\n*   **Major Industry Players:** Active companies in this space include Everspin Technologies, GlobalFoundaries, Samsung, Sony, TSMC, IBM, Micron, and Avalanche Technologies, among others [CITE:1][CITE:11].\n*   **Product Milestones:** Everspin has introduced a 3rd generation standalone 256Mb STT-MRAM and a 1Gb STT-MRAM. Additionally, collaborative efforts by Samsung, Sony, and Avalanche have produced 28nm and 40nm embedded STT-MRAM (eSTT-MRAM) nodes [CITE:1].\n*   **Generational Evolution:** The technology has progressed from 1st generation Toggle-mode MRAM to various iterations of STT-MRAM (2nd to 4th generation) featuring different Magnetic Tunnel Junction (MTJ) structures [CITE:1].\n\n### Technological Characteristics\n*   **STT-MRAM Mechanism:** This technology uses a two-terminal device structure where a Magnetic Tunnel Junction (MTJ) serves as the storage element. It relies on a bidirectional spin-polarized current to switch the magnetic orientation of a \"free layer\" relative to a \"fixed layer,\" changing the resistance state to represent binary data [CITE:2][CITE:4][CITE:9].\n*   **SOT-MRAM (Next Generation):** Spin-Orbit Torque (SOT) MRAM is considered the next generation of magnetic memory. Unlike STT-MRAM, it utilizes a three-terminal cell that isolates the read and write paths [CITE:3][CITE:8]. While it currently lacks mass-scale production due to early-stage manufacturing challenges, successful fabrication has been demonstrated with promising specifications [CITE:8].\n\n### Development Challenges\nDespite its advantages, STT-MRAM development faces specific hurdles:\n*   **Write Performance:** The write operation is significantly slower and more energy-consuming than the read operation [CITE:1]. The high write current results in energy consumption nearly 10 times that of SRAM and causes stress on the dielectric oxide, accelerating wear-out [CITE:3][CITE:4].\n*   **Read Disturbance (RD):** Because STT-MRAM shares a read-write path, it is vulnerable to read disturbance errors [CITE:3]. As technology scales and write currents decrease, the limited scalability of read currents increases the frequency of these errors [CITE:1].\n*   **Design Trade-offs:** There is a trade-off involving the Thermal Stability Factor ($\\Delta$). A high $\\Delta$ improves data retention but requires higher switching current and latency. Conversely, lowering $\\Delta$ reduces energy consumption but increases retention failure rates and read/write errors [CITE:7].\n\n### Advanced Architectures and Applications\nResearch is expanding MRAM utility beyond standard storage into logic and computing applications:\n*   **Logic-in-Memory (LiM):** To address the \"memory wall\" and reduce static power consumption, researchers are developing schemes to perform Boolean logic (e.g., NAND, NOR) directly within MRAM arrays [CITE:6][CITE:16].\n*   **Computational RAM (CRAM):** Specific architectures like CRAM use 2T-1M cells to perform in-memory logic operations, reducing the need for external sense amplifiers and logic gates [CITE:12][CITE:14].\n*   **R-MRAM:** This hybrid approach merges ROM with STT-MRAM. It has shown superiority in specific applications, such as Spiking Neural Networks, achieving 1.75 times lower energy consumption than standard STT-MRAM arrays [CITE:5]."
}
```

## 7. Parsed Citations

```json
{
  "citedIndices": [3, 10, 0, 1, 8, 2, 7, 6, 5, 15, 11, 13, 4],
  "citedChunks": [
    {
      "index": 3,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "contentPreview": "against radiation-induced soft errors,\nand CMOS compatibility of emerging Spin-based non-volatile\n(NVM) magnetic memory (i.e., MRAM) technologies, attracted\nresearchers from academia and industry [7]...."
    },
    {
      "index": 10,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "re is a strong need to understand the factors that\ncurrently limit the design and deployment of DS-IMC\nusing STT-MRAM. We provide some suggestions on\nresearch directions for addressing these gaps.\nII...."
    },
    {
      "index": 0,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "players, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT). ..."
    },
    {
      "index": 1,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "STT-MRAM (spin-transfer torque magnetic\nRandom Access Memory), PCRAM (phase-change RAM),\nand ReRAM (resistive RAM), among others, are pursued to\nfulfill some of these characteristics [12], [13], [14]...."
    },
    {
      "index": 8,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "OUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2...."
    },
    {
      "index": 2,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "contentPreview": "e performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM...."
    },
    {
      "index": 7,
      "paperId": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "contentPreview": "ring element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16]...."
    },
    {
      "index": 6,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "the MTJ cell size\nduring fabrication or by adjusting the Ms and Hk values at the\nmaterial level during the stack development.\nAn MTJ cell with a high∆value requires high switching\nlatency and energy. ..."
    },
    {
      "index": 5,
      "paperId": "2ce232110efddaa5544b276a2c37a200d43351e6",
      "contentPreview": "computing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution...."
    },
    {
      "index": 15,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "omputing, spin-transfer torque RAM.\nI. INTRODUCTION AND MOTIVATION\nMost modern computer systems are based on the von Neu-\nmann architecture, where memory units are separated from\nthe processing units...."
    },
    {
      "index": 11,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "ng STT-MRAM. One such challenge is understanding how\ndifferent cell array architectures perform logic operations. For\ninstance, the CRAM architecture [82], [75], [88] uses 2T-1M\ncells for computation...."
    },
    {
      "index": 13,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "to recent\nASIC implementations.\nThe article introduces CRAM [89], a memory design capa-\nble of in-memory logic operations. CRAM has two variants:\nSpin Torque Transfer (STT) and Spin-Hall Effect (SHE)...."
    },
    {
      "index": 4,
      "paperId": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "contentPreview": "ation in both RAM and ROM modes. Conversely, R-\nMRAM merges ROM with STT-MRAM, using an additional\nBit Line (BL) for ROM data. While supporting RAM and ROM\nmodes, R-MRAM prohibits simultaneous access...."
    }
  ]
}
```

## 8. Final Response

```json
{
  "answerLength": 3804,
  "answer": "Based on the provided research excerpts, the development of Magnetoresistive Random Access Memory (MRAM) has evolved through multiple generations, moving from research to commercial viability while facing specific technical challenges and architectural innovations.\n\n### Commercialization and Key Players\nSTT-MRAM (Spin-Transfer Torque MRAM) has transitioned from the research and development phase to commercialization, demonstrating greater viability than other emerging non-volatile memory technologies [CITE:4][CITE:11].\n*   **Major Industry Players:** Active companies in this space include Everspin Technologies, GlobalFoundaries, Samsung, Sony, TSMC, IBM, Micron, and Avalanche Technologies, among others [CITE:1][CITE:11].\n*   **Product Milestones:** Everspin has introduced a 3rd generation standalone 256Mb STT-MRAM and a 1Gb STT-MRAM. Additionally, collaborative efforts by Samsung, Sony, and Avalanche have produced 28nm and 40nm embedded STT-MRAM (eSTT-MRAM) nodes [CITE:1].\n*   **Generational Evolution:** The technology has progressed from 1st generation Toggle-mode MRAM to various iterations of STT-MRAM (2nd to 4th generation) featuring different Magnetic Tunnel Junction (MTJ) structures [CITE:1].\n\n### Technological Characteristics\n*   **STT-MRAM Mechanism:** This technology uses a two-terminal device structure where a Magnetic Tunnel Junction (MTJ) serves as the storage element. It relies on a bidirectional spin-polarized current to switch the magnetic orientation of a \"free layer\" relative to a \"fixed layer,\" changing the resistance state to represent binary data [CITE:2][CITE:4][CITE:9].\n*   **SOT-MRAM (Next Generation):** Spin-Orbit Torque (SOT) MRAM is considered the next generation of magnetic memory. Unlike STT-MRAM, it utilizes a three-terminal cell that isolates the read and write paths [CITE:3][CITE:8]. While it currently lacks mass-scale production due to early-stage manufacturing challenges, successful fabrication has been demonstrated with promising specifications [CITE:8].\n\n### Development Challenges\nDespite its advantages, STT-MRAM development faces specific hurdles:\n*   **Write Performance:** The write operation is significantly slower and more energy-consuming than the read operation [CITE:1]. The high write current results in energy consumption nearly 10 times that of SRAM and causes stress on the dielectric oxide, accelerating wear-out [CITE:3][CITE:4].\n*   **Read Disturbance (RD):** Because STT-MRAM shares a read-write path, it is vulnerable to read disturbance errors [CITE:3]. As technology scales and write currents decrease, the limited scalability of read currents increases the frequency of these errors [CITE:1].\n*   **Design Trade-offs:** There is a trade-off involving the Thermal Stability Factor ($\\Delta$). A high $\\Delta$ improves data retention but requires higher switching current and latency. Conversely, lowering $\\Delta$ reduces energy consumption but increases retention failure rates and read/write errors [CITE:7].\n\n### Advanced Architectures and Applications\nResearch is expanding MRAM utility beyond standard storage into logic and computing applications:\n*   **Logic-in-Memory (LiM):** To address the \"memory wall\" and reduce static power consumption, researchers are developing schemes to perform Boolean logic (e.g., NAND, NOR) directly within MRAM arrays [CITE:6][CITE:16].\n*   **Computational RAM (CRAM):** Specific architectures like CRAM use 2T-1M cells to perform in-memory logic operations, reducing the need for external sense amplifiers and logic gates [CITE:12][CITE:14].\n*   **R-MRAM:** This hybrid approach merges ROM with STT-MRAM. It has shown superiority in specific applications, such as Spiking Neural Networks, achieving 1.75 times lower energy consumption than standard STT-MRAM arrays [CITE:5].",
  "groundingChunksCount": 13,
  "groundingChunks": [
    {
      "index": 0,
      "paper_id": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "textPreview": "against radiation-induced soft errors,\nand CMOS compatibility of emerging Spin-based non-volatile\n(NVM) magnetic memory (i.e., MRAM) technologies, attracted\nresearchers from academia and industry [7]...."
    },
    {
      "index": 1,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "re is a strong need to understand the factors that\ncurrently limit the design and deployment of DS-IMC\nusing STT-MRAM. We provide some suggestions on\nresearch directions for addressing these gaps.\nII...."
    },
    {
      "index": 2,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "players, including Everspin Technologies,\nGlobalFoundaries, Avalanche Technologies, Sony, Micron,\nIMEC, CEA-LETI, Applied Materials, Samsung, Fujitsu,\nIBM, TSMC, and Spin Transfer Technologies (STT). ..."
    },
    {
      "index": 3,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "STT-MRAM (spin-transfer torque magnetic\nRandom Access Memory), PCRAM (phase-change RAM),\nand ReRAM (resistive RAM), among others, are pursued to\nfulfill some of these characteristics [12], [13], [14]...."
    },
    {
      "index": 4,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "OUND ON STT-MRAM\n1) Overview of STT-MRAM\na:Basics of STT-MRAM\nSTT-MRAM is comprised of a magnetic tunnel junction (MTJ)\ncell, which is used to store data, and an NMOS transistor,\nas shown in Figure 2...."
    },
    {
      "index": 5,
      "paper_id": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "textPreview": "e performance, Read Disturbance (RD), retention\nfailure, [9] [12] - stem from two main reasons. First, the high\nwrite current flowing through the MTJ accounts for almost\n10×energy consumption as SRAM...."
    },
    {
      "index": 6,
      "paper_id": "4ef86160b00fbcd0e378f07358fae1296fee081a",
      "textPreview": "ring element [15]. By splitting the read-\nwrite path and using a different switching scheme, SOT-MRAM\nresolves all the challenges of STT-MRAM while retaining its\nevery benefit [9] [12] [13] [14] [16]...."
    },
    {
      "index": 7,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "the MTJ cell size\nduring fabrication or by adjusting the Ms and Hk values at the\nmaterial level during the stack development.\nAn MTJ cell with a high∆value requires high switching\nlatency and energy. ..."
    },
    {
      "index": 8,
      "paper_id": "2ce232110efddaa5544b276a2c37a200d43351e6",
      "textPreview": "computing system. Regarding\nthe former issue, the emerging of non-volatile memory technolo-\ngies, such as Magnetoresistive RAM (MRAM) [5], Resistive RAM\n(RRAM) [8], etc, provide an effective solution...."
    },
    {
      "index": 9,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "omputing, spin-transfer torque RAM.\nI. INTRODUCTION AND MOTIVATION\nMost modern computer systems are based on the von Neu-\nmann architecture, where memory units are separated from\nthe processing units...."
    },
    {
      "index": 10,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "ng STT-MRAM. One such challenge is understanding how\ndifferent cell array architectures perform logic operations. For\ninstance, the CRAM architecture [82], [75], [88] uses 2T-1M\ncells for computation...."
    },
    {
      "index": 11,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "to recent\nASIC implementations.\nThe article introduces CRAM [89], a memory design capa-\nble of in-memory logic operations. CRAM has two variants:\nSpin Torque Transfer (STT) and Spin-Hall Effect (SHE)...."
    },
    {
      "index": 12,
      "paper_id": "0bef739daada6e2737fdb101ce36a90f60f17272",
      "textPreview": "ation in both RAM and ROM modes. Conversely, R-\nMRAM merges ROM with STT-MRAM, using an additional\nBit Line (BL) for ROM data. While supporting RAM and ROM\nmodes, R-MRAM prohibits simultaneous access...."
    }
  ],
  "groundingSupportsCount": 23,
  "groundingSupports": [
    {
      "segment": {
        "startIndex": 506,
        "endIndex": 514,
        "text": "[CITE:4]"
      },
      "groundingChunkIndices": [0]
    },
    {
      "segment": {
        "startIndex": 514,
        "endIndex": 523,
        "text": "[CITE:11]"
      },
      "groundingChunkIndices": [1]
    },
    {
      "segment": {
        "startIndex": 712,
        "endIndex": 720,
        "text": "[CITE:1]"
      },
      "groundingChunkIndices": [2]
    },
    {
      "segment": {
        "startIndex": 720,
        "endIndex": 729,
        "text": "[CITE:11]"
      },
      "groundingChunkIndices": [1]
    },
    {
      "segment": {
        "startIndex": 978,
        "endIndex": 986,
        "text": "[CITE:1]"
      },
      "groundingChunkIndices": [2]
    },
    {
      "segment": {
        "startIndex": 1207,
        "endIndex": 1215,
        "text": "[CITE:1]"
      },
      "groundingChunkIndices": [2]
    },
    {
      "segment": {
        "startIndex": 1592,
        "endIndex": 1600,
        "text": "[CITE:2]"
      },
      "groundingChunkIndices": [3]
    },
    {
      "segment": {
        "startIndex": 1600,
        "endIndex": 1608,
        "text": "[CITE:4]"
      },
      "groundingChunkIndices": [0]
    },
    {
      "segment": {
        "startIndex": 1608,
        "endIndex": 1616,
        "text": "[CITE:9]"
      },
      "groundingChunkIndices": [4]
    },
    {
      "segment": {
        "startIndex": 1827,
        "endIndex": 1835,
        "text": "[CITE:3]"
      },
      "groundingChunkIndices": [5]
    },
    {
      "segment": {
        "startIndex": 1835,
        "endIndex": 1843,
        "text": "[CITE:8]"
      },
      "groundingChunkIndices": [6]
    },
    {
      "segment": {
        "startIndex": 2012,
        "endIndex": 2020,
        "text": "[CITE:8]"
      },
      "groundingChunkIndices": [6]
    },
    {
      "segment": {
        "startIndex": 2240,
        "endIndex": 2248,
        "text": "[CITE:1]"
      },
      "groundingChunkIndices": [2]
    },
    {
      "segment": {
        "startIndex": 2397,
        "endIndex": 2405,
        "text": "[CITE:3]"
      },
      "groundingChunkIndices": [5]
    },
    {
      "segment": {
        "startIndex": 2405,
        "endIndex": 2413,
        "text": "[CITE:4]"
      },
      "groundingChunkIndices": [0]
    },
    {
      "segment": {
        "startIndex": 2533,
        "endIndex": 2541,
        "text": "[CITE:3]"
      },
      "groundingChunkIndices": [5]
    },
    {
      "segment": {
        "startIndex": 2674,
        "endIndex": 2682,
        "text": "[CITE:1]"
      },
      "groundingChunkIndices": [2]
    },
    {
      "segment": {
        "startIndex": 2991,
        "endIndex": 2999,
        "text": "[CITE:7]"
      },
      "groundingChunkIndices": [7]
    },
    {
      "segment": {
        "startIndex": 3347,
        "endIndex": 3355,
        "text": "[CITE:6]"
      },
      "groundingChunkIndices": [8]
    },
    {
      "segment": {
        "startIndex": 3355,
        "endIndex": 3364,
        "text": "[CITE:16]"
      },
      "groundingChunkIndices": [9]
    },
    {
      "segment": {
        "startIndex": 3552,
        "endIndex": 3561,
        "text": "[CITE:12]"
      },
      "groundingChunkIndices": [10]
    },
    {
      "segment": {
        "startIndex": 3561,
        "endIndex": 3570,
        "text": "[CITE:14]"
      },
      "groundingChunkIndices": [11]
    },
    {
      "segment": {
        "startIndex": 3795,
        "endIndex": 3803,
        "text": "[CITE:5]"
      },
      "groundingChunkIndices": [12]
    }
  ]
}
```

---

# End of Trace
